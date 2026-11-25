#!/bin/bash
set -e

# Use the C++ header explicitly on case-insensitive filesystems.
header="ios/Kashir.h"
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's|#import "kashir.h"|#import "../cpp/kashir.h"|' "$header"
else
    sed -i 's|#import "kashir.h"|#import "../cpp/kashir.h"|' "$header"
fi
