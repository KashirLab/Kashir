import Foundation
import SafariReward
import SafariServices
import Security

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private static let walletGroup = "group.kashir"

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        guard let message = item?.userInfo?[SFExtensionMessageKey] as? [String: String],
              let lnurl = message["lnurl"] else {
            reply(to: context, with: ["error": RewardRedemptionError.invalidReward.localizedDescription])
            return
        }

        Task {
            do {
                let amount = try await redeem(lnurl)
                reply(to: context, with: ["amount": String(amount)])
            } catch {
                let response: [String: String]
                switch error as? RewardRedemptionError {
                case .busy, .pending:
                    response = ["retry": "true", "error": error.localizedDescription]
                case .some:
                    response = ["error": error.localizedDescription]
                case nil:
                    response = ["error": "Could not redeem the reward. Reload the page to retry."]
                }
                reply(to: context, with: response)
            }
        }
    }

    private func redeem(_ lnurl: String) async throws -> UInt64 {
        let offerURL = try decodeLNURL(lnurl)
        let site = try adsSite()
        guard let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: Self.walletGroup
              ) else {
            throw RewardRedemptionError.walletUnavailable
        }

        let database = container.appendingPathComponent("wallet/cdk_multimint_wallet.db")
        let redemption = RewardRedemption(
            site: site,
            stateDirectory: container.appendingPathComponent("wallet/rewards", isDirectory: true)
        )
        return try await redemption.redeem(
            offerURL: offerURL,
            walletDatabaseURL: database,
            loadWalletCredentials: {
                (try self.credential("KashirSharedWalletSeed"), try self.credential("KashirSharedWalletMint"))
            }
        )
    }

    private struct Manifest: Decodable {
        struct ContentScript: Decodable {
            let matches: [String]
        }

        let content_scripts: [ContentScript]
    }

    private func adsSite() throws -> URL {
        guard let manifestURL = Bundle.main.url(forResource: "manifest", withExtension: "json") else {
            throw RewardRedemptionError.invalidReward
        }
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: manifestURL))
        guard let pattern = manifest.content_scripts.first?.matches.first,
              pattern.hasSuffix("/*"),
              let site = URL(string: String(pattern.dropLast(2))) else {
            throw RewardRedemptionError.invalidReward
        }
        return site
    }

    private func credential(_ service: String) throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccessGroup as String: Self.walletGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8), !value.isEmpty else {
            throw RewardRedemptionError.walletUnavailable
        }
        return value
    }

    private func reply(to context: NSExtensionContext, with message: [String: String]) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: message]
        context.completeRequest(returningItems: [response])
    }
}
