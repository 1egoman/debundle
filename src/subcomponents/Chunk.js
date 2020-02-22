const fs = require('fs');
const path = require('path');

const acorn = require('acorn');
const estraverse = require('estraverse');

const request = require('sync-request');

const Module = require('./Module');

const { parseBundleModules } = require('../utils');
const { DEFAULT_CHUNK } = require('../settings');

class Chunk {
  constructor(bundle, fileName, bundleModules=null) {
    this.bundle = bundle;

    this.fileName = fileName;

    if (bundleModules) {
      // If bundleModules was already defined, assume that this chunk represents the main bundle.
      this.ids = [DEFAULT_CHUNK];
      this.ast = null;
      this.fileName = 'default.bundle.js';
    } else {
      // No modules were specified. We'll need to locate the bundle chunk seperately on our own.
      this.bundle.log(`Locating chunk ${fileName}...`);
      this.bundle.log(`=> first, try reading from filesystem: ${this.filePath}`);
      let chunkContents;
      try {
        chunkContents = fs.readFileSync(this.filePath);
      } catch (err) {
        this.bundle.log(`   reading from filesystem failed: ${err}`);

        this.bundle.log(`=> second, try reading from server: ${this.url}`);
        const response = request('GET', this.url, this.bundle.chunkHttpRequestOptions);
        if (response.statusCode >= 400) {
          this.bundle.log(`   reading from server failed: ${response.statusCode} ${response.body}`);
          throw new Error(
            `Cannot locate chunk ${this.fileName} - tried both locally (${this.filePath}) and on the web (${this.url})`
          );
        }
        chunkContents = response.body;
      }
      this.bundle.log(`      read successfully!`);
      this.ast = acorn.parse(chunkContents, {});

      // Add `_parent` property to every node, so that the parent can be
      // determined in later code.
      estraverse.traverse(this.ast, {
        fallback: 'iteration',
        enter: function(node, parent) {
          node._parent = parent;
        },
      });

      let chunkIds, moduleList;

      estraverse.traverse(this.ast, {
        fallback: 'iteration',
        enter: function(node, parent) {
          const chunkIdArray = (
            node.type === 'ArrayExpression' &&
            node.elements.length > 0 &&
            node.elements.every(n => n.type === 'Literal') &&
            node.elements.map(n => n.value)
          );

          if (!chunkIdArray) {
            return;
          }

          const parentElements = parent && parent.type === 'CallExpression' ? parent.arguments : parent.elements;
          const moduleListAst = (
            parentElements &&
            parentElements.length >= 2 &&
            (parentElements[1].type.startsWith('Array') || parentElements[1].type.startsWith('Object')) &&
            parentElements[1]
          );

          if (!moduleListAst) {
            return;
          }

          chunkIds = chunkIdArray;
          moduleList = moduleListAst;
          this.break();
        },
      });

      if (!moduleList) {
        throw new Error(`Could not generate module list for ${this.fileName}`);
      }

      this.ids = chunkIds
      bundleModules = parseBundleModules(moduleList, this.bundle, true);
    }

    this.modules = new Map(
      bundleModules
      .flatMap(([moduleId, moduleAst]) => {
        // Sometimes, modules are null. This is usually because they are a empty / a placeholder
        // for a module that exists in a different bundle chunk / in a different javascript file.
        if (moduleAst === null) {
          return [];
        } else {
          return [
            [moduleId, new Module(this, moduleId, moduleAst)]
          ];
        }
      })
    );
  }

  get [Symbol.toStringTag]() {
    return `chunk ${this.fileName}: ${this.modules.size} modules`;
  }

  get url() {
    let origin = this.bundle.publicPathPrefix;
    if (origin.length > 0 && !origin.endsWith('/')) { origin += '/' }
    return origin + this.bundle.webpackBootstrap.publicPath + this.fileName;
  }

  get filePath() {
    return path.join(path.dirname(this.bundle.path), this.fileName);
  }
}

module.exports = Chunk;
