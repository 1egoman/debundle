#!/usr/bin/env node
const Bundle = require('./subcomponents/Bundle');
const Chunk = require('./subcomponents/Chunk');
const Module = require('./subcomponents/Module');
const WebpackBootstrap = require('./subcomponents/WebpackBootstrap');

module.exports = Bundle;
module.exports.Bundle = Bundle;
module.exports.Chunk = Chunk;
module.exports.Module = Module;
module.exports.WebpackBootstrap = WebpackBootstrap;

// The rest of the program only runs if the script was executed directly.
if (require.main !== module) {
  return;
}

const program = require('commander');

let bundlePath;
program
  .version(require('../package.json').version)
  .option('--verbose', 'output extra debugging information')
  .arguments('<bundle>')
  .action(b => {
    bundlePath = b;
  });
 
program.parse(process.argv);

if (!bundlePath) {
  console.error('Error: the path to a javascript bundle is required.');
  console.error('ie: debundle ./path/to/javascript/bundle.js');
  process.exit(1);
}
 
const bundle = new Bundle(bundlePath);
bundle.parse();
bundle.writeAll();
