#!/bin/bash
TEST_BUNDLE_FILE="$1/bundle.js"
TEST_BUNDLE_OUTPUT="dist/"
TEST_BUNDLE_KNOWN="$1/src/"
TEST_BUNDLE_CONFIG="$1/debundle.config.json"

# Remove the output directory, if it exists
rm -rf $TEST_BUNDLE_OUTPUT

# Debundle the bundle
echo ./src/index.js -i $TEST_BUNDLE_FILE -o $TEST_BUNDLE_OUTPUT -c $TEST_BUNDLE_CONFIG
./src/index.js -i $TEST_BUNDLE_FILE -o $TEST_BUNDLE_OUTPUT -c $TEST_BUNDLE_CONFIG

# # Are the files the same?
# diff -r $TEST_BUNDLE_KNOWN $TEST_BUNDLE_OUTPUT
# IS_DIFFERENT="$?"
#
# # Report.
# if [ $IS_DIFFERENT -eq 0 ]; then
#   echo "PASSED"
#   exit 0
# else
#   echo "FAILED"
#   exit 1
# fi
