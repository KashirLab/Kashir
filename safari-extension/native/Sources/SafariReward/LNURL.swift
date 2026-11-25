import Foundation

public func decodeLNURL(_ lnurl: String) throws -> URL {
    let normalized = lnurl.lowercased()
    guard lnurl.count <= 4096, normalized.hasPrefix("lnurl1"),
          lnurl == normalized || lnurl == lnurl.uppercased() else {
        throw RewardRedemptionError.invalidReward
    }

    let alphabet = Array("qpzry9x8gf2tvdw0s3jn54khce6mua7l")
    let words = try normalized.dropFirst(6).map { character -> UInt32 in
        guard let index = alphabet.firstIndex(of: character) else {
            throw RewardRedemptionError.invalidReward
        }
        return UInt32(index)
    }
    guard words.count > 6 else { throw RewardRedemptionError.invalidReward }

    let prefix = Array("lnurl".utf8.map(UInt32.init))
    let generators: [UInt32] = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    var checksum: UInt32 = 1
    for word in prefix.map({ $0 >> 5 }) + [0] + prefix.map({ $0 & 31 }) + words {
        let top = checksum >> 25
        checksum = ((checksum & 0x1ffffff) << 5) ^ word
        for (index, generator) in generators.enumerated() where (top >> index) & 1 != 0 {
            checksum ^= generator
        }
    }
    guard checksum == 1 else { throw RewardRedemptionError.invalidReward }

    var bytes = [UInt8]()
    var accumulator: UInt32 = 0
    var bits = 0
    for word in words.dropLast(6) {
        accumulator = ((accumulator << 5) | word) & 0xfff
        bits += 5
        if bits >= 8 {
            bits -= 8
            bytes.append(UInt8((accumulator >> bits) & 0xff))
        }
    }
    guard bits < 5, (accumulator & ((1 << bits) - 1)) == 0,
          let text = String(bytes: bytes, encoding: .utf8),
          let url = URL(string: text) else {
        throw RewardRedemptionError.invalidReward
    }
    return url
}
