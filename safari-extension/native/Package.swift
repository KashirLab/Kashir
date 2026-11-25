// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SafariReward",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [.library(name: "SafariReward", targets: ["SafariReward"])],
    dependencies: [
        .package(url: "https://github.com/cashubtc/cdk-swift.git", exact: "0.18.3")
    ],
    targets: [
        .target(name: "SafariReward", dependencies: [.product(name: "Cdk", package: "cdk-swift")])
    ]
)
