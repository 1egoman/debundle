#!/usr/bin/env node
const acorn = require('acorn');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const args = require('minimist')(process.argv.slice(2));

const bundleLocation = args._[0] || args.input || args.i;
const outputLocation = args.output || args.o;
const configPath = args.config || args.c;

if (!(bundleLocation && outputLocation && configPath)) {
  console.log(`This is a debundler - it takes a bundle and expands it into the source that was used to compile it.`);
  console.log();
  console.log(`Usage: ${process.argv[1]} [input file] {OPTIONS}`);
  console.log();
  console.log(`Options:`);
  console.log(`   --input,  -i  Bundle to debundle`);
  console.log(`   --output, -o  Directory to debundle code into.`);
  console.log(`   --config, -c  Configuration directory`);
  console.log();
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(args.config || args.c));

function convertToIntegerKey(obj) {
  return Object.keys(obj).reduce((acc, i) => {
    acc[parseInt(i) || i] = obj[i];
    return acc;
  }, {});
}

if (config.knownPaths) {
  config.knownPaths = convertToIntegerKey(config.knownPaths);
} else {
  throw new Error('config.knownPaths is a required parameter that indicated known paths to a module given its id.');
}

if (config.entryPoint === undefined) {
  throw new Error('config.entryPoint is a required parameter that indicated the entry point in the bundle.');
}

if (!config.moduleAst) {
  if (config.type === 'browserify') {
    // Where browserify defaultly stores all it's embedded modules as an object
    config.moduleAst = ["body", 0, "expression", "arguments", 0];
  } else if (config.type === 'webpack') {
    // Where webpack defaultly stores all it's embedded modules as an array
    config.moduleAst = ["body", 0, "expression", "arguments", 0];
  }
  console.log(`* Using default AST location for ${config.type}...`);
}



console.log('* Reading bundle...');
const bundleContents = fs.readFileSync(bundleLocation);

let ast = acorn.parse(bundleContents, {});


// TODO
// KNOWN BUGS
// - If a package has a nonstandard location for it's root file (ie, not in index.js), and that
// location is in a folder, then we aren't smart enough to put that in the right location.
// ie, blueprint has it's root in `src/index.js` and it requires `./common` from that file, which
// when the root file is put in `index.js` it can't resolve.

// Browserify bundles start with an IIFE. Fetch the IIFE and get it's arguments (what we care about,
// and where all the module code is located)

let iifeModules = ast;
while (true) {
  let operation = config.moduleAst.shift();
  if (operation === undefined) {
    break;
  } else if (!iifeModules) {
    throw new Error(`Locating the module AST failed. Please specifify a valid manual ast path in your config file with the key \`moduleAst\``);
  } else {
    iifeModules = iifeModules[operation];
  }
}

// Known paths are inserted absolutely into requires. They need to be made relative.
//



// Webpack bundle
// let iifeModules = ast.body[0].expression.arguments[0];






console.log('* Decoding modules...');

let modules;
if (config.type === 'browserify') {
  // Normalize all require function calls to all contain the module id.
  // var a = require('a') => var a = require(1)
  const browserifyDecoder = require('./decoders/browserify');
  modules = browserifyDecoder(iifeModules);
} else {
  const webpackDecoder = require('./decoders/webpack');
  modules = webpackDecoder(iifeModules, config.knownPaths);
}

// Transform the module id in each require call into a relative path to the module.
// var a = require(1) => var a = require('./path/to/a')
console.log('* Reassembling requires...');
const transformRequires = require('./transformRequires');
modules = transformRequires(modules, config.knownPaths, config.entryPoint, config.type);

// Take the array of modules and figure out where to put each module on disk.
// module 1 => ./dist/path/to/a.js
console.log('* Resolving files...');
const lookupTableResolver = require('./lookupTable');
const files = lookupTableResolver(
  modules,
  config.knownPaths,
  config.entryPoint,
  config.type,
  outputLocation
);



console.log('* Writing to disk...');
const writeToDisk = require('./writeToDisk');
writeToDisk(files);
