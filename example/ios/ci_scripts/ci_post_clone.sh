#!/bin/bash
set -euo pipefail

cd "$CI_PRIMARY_REPOSITORY_PATH"
git submodule update --init --recursive

if ! node -e 'process.exit(process.versions.node.split(".")[0] === "24" && Number(process.versions.node.split(".")[1]) >= 3 ? 0 : 1)' 2>/dev/null; then
    brew install node@24
    export PATH="$(brew --prefix node@24)/bin:$PATH"
fi

# Use the repository's Yarn release for nested build scripts too.
yarn_bin="$(mktemp -d)"
cat > "$yarn_bin/yarn" <<'SH'
#!/bin/bash
exec node "$CI_PRIMARY_REPOSITORY_PATH/.yarn/releases/yarn-3.6.1.cjs" "$@"
SH
chmod +x "$yarn_bin/yarn"
export PATH="$yarn_bin:$HOME/.cargo/bin:$PATH"

if ! command -v rustup >/dev/null; then
    curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain none
fi
RUSTUP_TOOLCHAIN="$(sed -n 's/^channel = "\([^"]*\)"$/\1/p' rust-toolchain.toml)"
export RUSTUP_TOOLCHAIN
rustup toolchain install "$RUSTUP_TOOLCHAIN" --profile minimal \
    --target aarch64-apple-ios \
    --target aarch64-apple-ios-sim \
    --target x86_64-apple-ios

yarn install --immutable
yarn ubrn:ios

printf 'export NODE_BINARY="%s"\n' "$(command -v node)" \
    > example/ios/.xcode.env.local
