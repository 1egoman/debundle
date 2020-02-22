const fs = require('fs');
const path = require('path');

const escope = require('escope');
const escodegen = require('escodegen');
const chalk = require('chalk');
const mkdirp = require('mkdirp');

const { cloneAst, highlight } = require('../utils');
const { DEFAULT_CHUNK } = require('../settings');

// Thrown when a require function is encountered with multiple arguments
class RequireFunctionHasMultipleArgumentsError extends Error {}

class Module {
  constructor(chunk, moduleId, ast) {
    this.chunk = chunk;
    this.bundle = this.chunk.bundle;

    this.id = moduleId;
    this.ast = ast;

    this._packageName = null;

    this.metadataFileConfig = (
      (this.bundle.metadataFileContents.modules || []).find(i => i.id === this.id)
    ) || {};

    this._defaultPath = `${chunk.ids.join('-')}-${this.id}.js`.replace(new RegExp(path.sep, 'g'), '-');
    this.path = this.metadataFileConfig.path || this._defaultPath;
    this.comment = null;

    this.scopeManager = escope.analyze(this.ast);

    // Find all referenced to `require(...)` in the module, and figure out which modules are being
    // required
    this._dependencyModuleIds = this._findAllRequireFunctionCalls();

    const dependencyModuleIdsRaw = this._dependencyModuleIds.filter(i => i.moduleId).map(i => i.moduleId);
    this.bundle.log([
      `Discovered module ${moduleId} `,
      `(chunk ${highlight(JSON.stringify(chunk.ids))}`,
      `${
        (dependencyModuleIdsRaw.length > 0 ? ', depends on ' : '') +
        dependencyModuleIdsRaw.slice(0, 3).map(i => chalk.green(i)).join(', ') +
        (dependencyModuleIdsRaw.length > 3 ? `, and ${dependencyModuleIdsRaw.length-3} more` : '')
      })`,
    ].join(''));
    this.bundle.logIndent();

    // If any modules were found to be in additional chunks that were not previously known about,
    // add them.
    this._dependencyModuleIds
      .filter(i => i.type === 'REQUIRE_ENSURE')
      .filter(({chunkId}) => !(
        chunkId === DEFAULT_CHUNK ||
        this.chunk.ids.includes(chunkId) ||
        this.bundle.getChunk(chunkId)
      ))
      .forEach(({chunkId, moduleId}) => {
        this.bundle.log(
          `Module ${this.id} depends on chunk ${chunkId}, parsing new chunk...`
        );

        const chunkFileName = this.bundle.chunkNameMapping[chunkId] || `${chunkId}${this.bundle.chunkFileNameSuffix}`;
        this.bundle.addChunk(chunkFileName);
      });

    this.bundle.logDedent();
    if (this.path.includes(path.sep)) {
    }
  }

  get absolutePath() {
    return path.join(this.bundle.distPath, this.path);
  }

  // Get a reference to require, module, or exports defined in the module closure
  _getModuleClosureVariable(varname) {
    const index = this.bundle.moduleClosureParamMetadata().paramIndexes.indexOf(varname);
    const node = this.ast.params[index];
    if (!node) { return null; }

    return this.scopeManager.scopes[0].variables.find(v => v.name === node.name);
  }
  get requireVariable() { return this._getModuleClosureVariable('require'); }
  get moduleVariable() { return this._getModuleClosureVariable('module'); }
  get exportsVariable() { return this._getModuleClosureVariable('exports'); }


  get dependencies() {
    return new Map(this._dependencyModuleIds.filter(a => a.moduleId !== null).map(({moduleId}) => (
      [moduleId, this.bundle.getModule(moduleId)]
    )));
  }

  code(opts={renameVariables: true, removeClosure: true}) {
    const originalAst = cloneAst(this.ast);

    if (opts.renameVariables) {
      if (this.requireVariable) {
        // Adjust all require calls to contain the path to the module that is desired
        this._findAllRequireFunctionCalls().forEach(call => {
          if (!this.bundle.modules.get(call.moduleId)) {
            return;
          }

          const requiredModulePath = this.bundle.modules.get(call.moduleId).absolutePath;

          // Determine the require path that must be used to access the module requested from
          // the current module.
          call.ast.value = './' + path.relative(
            path.dirname(this.absolutePath),
            requiredModulePath
          );
        });

        // Rename __webpack_require__ (or minified name) to require
        this.renameVariable(this.requireVariable, 'require');
      }

      const moduleVariable = this.moduleVariable;
      if (moduleVariable) {

        // Update the minified value of `module.exports` to be `module.exports`
        // ie, `f.P` (from one random bundle, as an example) => `module.exports`
        moduleVariable.references.forEach(ref => {
          const n = ref.identifier._parent;
          if (n.type !== 'MemberExpression') { return; }

          const moduleExportsKey = this.bundle.moduleClosureParamMetadata().moduleExportsKey;
          if (n.property.name !== moduleExportsKey) { return; }

          n.property.name = 'exports';
        });

        // Rename the module closure variable to module (the bundle may be minified and this may not be
        // the case already)
        this.renameVariable(moduleVariable, 'module');
      }

      const exportsVariable = this.exportsVariable;
      if (exportsVariable) {
        // Rename the exports closure variable to module (the bundle may be minified and this may not
        // be the case already)
        this.renameVariable(this.exportsVariable, 'exports');
      }
    }

    const newAst = this.ast;
    this.ast = originalAst;

    let code;
    if (opts.removeClosure) {
      code = newAst.body.body.map(e => escodegen.generate(e)).join('\n');
    } else {
      code = escodegen.generate(newAst);
    }

    // Add comment to beginning of code, if it is defined.
    if (this.comment) {
      return `/*\n${this.comment}\n*/\n${code}`;
    } else {
      return code;
    }
  }

  // Rename a variable in the module to be a different name
  renameVariable(variable, newName) {
    // Rename all instances of the variabl
    variable.identifiers.forEach(ident => {
      ident.name = newName;
    })

    // Rename all other references of the variable, too
    variable.references.forEach(reference => {
      reference.identifier.name = newName;
    });
    return this;
  }

  // Returns an array of objects of {type, chunkId, moduleId, ast}, retreived by parting the AST and
  // determining all the times that the `require` or `require.ensure` functions were invoked.
  _findAllRequireFunctionCalls() {
    const requireFunctionVariable = this.requireVariable;

    // If no require function is defined in the module, then it cannot have any dependencies
    if (!requireFunctionVariable) {
      return [];
    }

    return requireFunctionVariable.references.map(reference => {
      const requireCallExpression = reference.identifier._parent;

      // __webpack_require__(4)
      const isRequireCall = (
        requireCallExpression.type === 'CallExpression' &&
        requireCallExpression.callee.type === 'Identifier' &&
        requireCallExpression.callee.name === reference.identifier.name
      );
      if (isRequireCall) {
        const requireArguments = requireCallExpression.arguments;

        if (requireArguments.length > 1) {
          throw new RequireFunctionHasMultipleArgumentsError(
            `The require function found at ${reference.identifier.start}-${reference.identifier.end} had more than one argument - it had ${requireArguments.length} (${requireArguments.map(arg => arg.raw).join(', ')})`
          )
        }

        return {
          type: 'REQUIRE_FUNCTION',
          chunkId: null,
          moduleId: requireArguments[0].value,
          ast: requireArguments[0],
        };
      }

      // __webpack_require__.e(0)
      const isRequireEnsureCall = (
        requireCallExpression._parent.type === 'CallExpression' &&
        requireCallExpression._parent.callee.type === 'MemberExpression' &&
        requireCallExpression._parent.callee.object.type === 'Identifier' &&
        requireCallExpression._parent.callee.object.name === reference.identifier.name &&
        requireCallExpression._parent.callee.property.name === 'e' &&
        requireCallExpression._parent.arguments &&
        requireCallExpression._parent.arguments[0].type === 'Literal'
      );
        // // Assert Module ID is in the right location
        // .then(__webpack_require__.bind(null, 4))
        // requireCallExpression.type === 'MemberExpression' &&
        // requireCallExpression.property.name === 'bind' &&
        // requireCallExpression.property.name === 'bind' &&
        // requireCallExpression._parent.type === 'CallExpression' &&
        // requireCallExpression._parent.arguments.length === 2 &&
        // requireCallExpression._parent.arguments[1].type === 'Literal' &&

      if (isRequireEnsureCall) {
        const chunkId = requireCallExpression._parent.arguments[0].value;
        return {
          type: 'REQUIRE_ENSURE',
          chunkId,
          moduleId: null,
          ast: requireCallExpression._parent,
        };
      }

      // __webpack_require__.t.bind(null, 0)
      const isRequireTCall = (
        requireCallExpression._parent._parent.type === 'CallExpression' &&
        requireCallExpression._parent._parent.callee.type === 'MemberExpression' &&
        requireCallExpression._parent._parent.callee.property.name === 'bind' &&
        requireCallExpression._parent._parent.callee.object.type === 'MemberExpression' &&
        requireCallExpression._parent._parent.callee.object.object.type === 'Identifier' &&
        requireCallExpression._parent._parent.callee.object.object.name === reference.identifier.name &&
        requireCallExpression._parent._parent.callee.object.property.type === 'Identifier' &&
        requireCallExpression._parent._parent.callee.object.property.name === 't' &&
        requireCallExpression._parent._parent.arguments &&
        requireCallExpression._parent._parent.arguments[1].type === 'Literal'
      );

      if (isRequireTCall) {
        const moduleId = requireCallExpression._parent._parent.arguments[1].value;
        return {
          type: 'REQUIRE_T',
          chunkId: null,
          moduleId,
          ast: requireCallExpression._parent._parent._parent,
        };
      }

      return null;
    }).filter(i => i !== null);
  }

  get _absolutePath() {
    return path.join('/', path.normalize(this.path));
  }

  resolve(p) {
    if (!this.path) {
      throw new Error('In order to use module.resolve, please first define module.path.');
    }

    function addExtension(p) {
      if (!p.endsWith('.js')) {
        return `${p}.js`;
      } else {
        return p;
      }
    }

    if (p.startsWith('/')) {
      // Absolute path, like `/tmp/myfile.js`
      return addExtension(p);
    } else if (p.startsWith('./') || p.startsWith('../')) {
      // Relative path, like `./foo.js`
      const moduleDirName = path.dirname(this._absolutePath);
      return `.${addExtension(path.join(moduleDirName, p))}`;
    } else {
      // Node module
      let [moduleName, ...path] = p.split('/');
      if (path.length === 0) {
        path = ['index.js'];
      }
      const modulePath = `./node_modules/${moduleName}/${path}`;
      return modulePath;
    }
  }

  async write(opts=undefined) {
    let filePath = this.absolutePath;

    await mkdirp(path.dirname(filePath))

    await fs.promises.writeFile(
      filePath,
      this.code(opts),
    );
  }

  // When called, rename this module's path to be `node_modules/packageName`, and
  // then move all dependant packages inside this package, too.
  get packageName() { return this._packageName; }
  set packageName(packageName) {
    this._packageName = packageName;
    function recursivelyApplyPathPrefix(mod) {
      mod.path = `node_modules/${packageName}/${mod.path}`;

      for (const [id, dependant] of mod.dependencies) {
        recursivelyApplyPathPrefix(dependant);
      }
    }

    recursivelyApplyPathPrefix(this);

    this.path = `node_modules/${packageName}/index.js`;
  }
}

module.exports = Module;
