import Cdk
import CryptoKit
import Darwin
import Foundation

public enum RewardRedemptionError: LocalizedError {
    case busy
    case invalidReward
    case pending
    case rejected
    case walletUnavailable

    public var errorDescription: String? {
        switch self {
        case .busy: return "Another reward redemption is in progress."
        case .invalidReward: return "The ad reward request is invalid."
        case .pending: return "The reward payment is still pending."
        case .walletUnavailable: return "Open Kashir and set up a wallet with an active mint first."
        case .rejected: return "The reward site rejected the payment request."
        }
    }
}

/// Redeems validated ad rewards into an existing CDK wallet.
public struct RewardRedemption {
    private struct Offer: Decodable {
        let tag: String
        let callback: URL
        let k1: String
        let minWithdrawable: UInt64
        let maxWithdrawable: UInt64
    }

    private struct CallbackResponse: Decodable {
        let status: String
    }

    private struct Receipt: Codable {
        let quoteID: String
        let invoice: String
        let amount: UInt64
        let callback: URL
        let k1: String
        let mintURL: String
        var completed: Bool?
    }

    private let site: URL
    private let stateDirectory: URL

    public init(site: URL, stateDirectory: URL) {
        self.site = site
        self.stateDirectory = stateDirectory
    }

    public func redeem(
        offerURL: URL,
        walletDatabaseURL: URL,
        loadWalletCredentials: () throws -> (mnemonic: String, mintURL: String)
    ) async throws -> UInt64 {
        try validate(offerURL)
        let lockPath = walletDatabaseURL.path + ".lock"
        let lock = open(lockPath, O_CREAT | O_RDWR | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard lock >= 0 else { throw POSIXError(.EIO) }
        defer { close(lock) }
        guard flock(lock, LOCK_EX | LOCK_NB) == 0 else { throw RewardRedemptionError.busy }

        let (mnemonic, mintURL) = try loadWalletCredentials()
        try FileManager.default.createDirectory(at: stateDirectory, withIntermediateDirectories: true)
        let receiptURL = stateDirectory.appendingPathComponent(
            SHA256.hash(data: Data(offerURL.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined() + ".json"
        )
        let existing: Receipt?
        if FileManager.default.fileExists(atPath: receiptURL.path) {
            existing = try JSONDecoder().decode(Receipt.self, from: Data(contentsOf: receiptURL))
        } else {
            existing = nil
        }
        guard FileManager.default.fileExists(atPath: walletDatabaseURL.path) else {
            throw RewardRedemptionError.walletUnavailable
        }
        let walletRepository = try WalletRepository(
            mnemonic: mnemonic, store: sqliteWalletStore(path: walletDatabaseURL.path)
        )
        if let existing, existing.completed == true { return existing.amount }
        let wallet = try await walletRepository.getWallet(
            mintUrl: MintUrl(url: existing?.mintURL ?? mintURL),
            unit: .sat
        )

        var receipt: Receipt
        if let existing {
            receipt = existing
            _ = try await wallet.recoverIncompleteSagas()
        } else {
            let offer: Offer = try await fetch(offerURL)
            let amount = offer.maxWithdrawable / 1000
            guard offer.tag == "withdrawRequest", !offer.k1.isEmpty,
                  amount > 0, amount * 1000 >= offer.minWithdrawable else {
                throw RewardRedemptionError.invalidReward
            }
            try validate(offer.callback)
            let quote = try await wallet.mintQuote(
                paymentMethod: .bolt11, amount: Amount(value: amount),
                description: "Ad reward withdrawal", extra: nil
            )
            receipt = Receipt(
                quoteID: quote.id, invoice: quote.request, amount: amount,
                callback: offer.callback, k1: offer.k1, mintURL: mintURL, completed: nil
            )
            try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
        }

        if try await claimIfPaid(receipt, wallet: wallet) {
            receipt.completed = true
            try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
            return receipt.amount
        }
        var callback = URLComponents(url: receipt.callback, resolvingAgainstBaseURL: false)
        var query = callback?.queryItems ?? []
        query.removeAll { $0.name == "k1" || $0.name == "pr" }
        query.append(URLQueryItem(name: "k1", value: receipt.k1))
        query.append(URLQueryItem(name: "pr", value: receipt.invoice))
        callback?.queryItems = query
        guard let callbackURL = callback?.url else { throw RewardRedemptionError.invalidReward }

        // A failed response can still mean that payment went through.
        let response: CallbackResponse? = try? await fetch(callbackURL)
        for _ in 0..<5 {
            if try await claimIfPaid(receipt, wallet: wallet) {
                receipt.completed = true
                try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
                return receipt.amount
            }
            if let response, response.status != "OK" { throw RewardRedemptionError.rejected }
            try await Task.sleep(nanoseconds: 2_000_000_000)
        }
        throw RewardRedemptionError.pending
    }

    private func claimIfPaid(_ receipt: Receipt, wallet: Wallet) async throws -> Bool {
        let quote = try await wallet.checkMintQuote(quoteId: receipt.quoteID)
        if quote.state == .issued { return true }
        guard quote.state == .paid else { return false }
        _ = try await wallet.mint(
            quoteId: receipt.quoteID, amountSplitTarget: .none, spendingConditions: nil
        )
        return true
    }

    private func validate(_ url: URL) throws {
        guard url.scheme == "https", url.host == site.host,
              (url.port ?? 443) == (site.port ?? 443), url.user == nil, url.password == nil else {
            throw RewardRedemptionError.invalidReward
        }
    }

    private func fetch<T: Decodable>(_ url: URL) async throws -> T {
        try validate(url)
        let session = URLSession(configuration: .ephemeral, delegate: RejectRedirects(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: URLRequest(url: url, timeoutInterval: 15))
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw RewardRedemptionError.rejected
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
