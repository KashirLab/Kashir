#!/bin/bash
# Align CDK with the UniFFI version used by the React Native generator.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cdk_manifest="$PROJECT_ROOT/deps/cdk/Cargo.toml"
expression='s/^uniffi = "[^"]*"/uniffi = "=0.31.2"/'

if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$expression" "$cdk_manifest"
else
    sed -i "$expression" "$cdk_manifest"
fi
