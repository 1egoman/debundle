const fs = require('fs');
const path = require('path');

const acorn = require('acorn');
const escope = require('escope');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

const request = require('sync-request');

const chalk = require('chalk');
const cliHighlight = require('cli-highlight').highlight;
const highlight = (code) => cliHighlight(code, {language: 'javascript', ignoreIllegals: true});

const METADATA_FILE_TEMPLATE = `// This auto-generated file defines some options used when "<PATH>" is debundled.
module.exports = () => (<JSON>)\n`;

class ExtendedError extends Error {
  constructor(name, message, ...args /*, context */) {
    let context = {};
    if (typeof args[args.length-1] !== 'string') {
      context = args.pop();
    }
    let description = args.join('\n');
    super([
      message,
      ...(description ? [`\nDetails: ${description}`] : []),
      `\nContext: ${JSON.stringify(context)}`,
    ].join('\n'));
    this.name = name;
    this.context = context;
  }
}

function parseBundleModules(node, bundle, isChunk=false) {
    throw new ExtendedError('BundleModuleParsingError',
      'Cannot locate modules within bundle - it is not an array or an object!',
      'The module bootstrapping function was found and parsed, but no array or object',
      'containing module closures was found. This probably means that the module being parsed',
      'is something a bit unusual, and in order to unpack this bundle, a manual path to the',
      'module array must be specified by adding a "moduleClosurePath" key to the "options" object',
      `in the ${bundle.metadataFilePath} file that was created. For more information, see [INSERT LINK HERE].`,
      {foo: true}
    );
  if (node.type === 'ObjectExpression') {
    // Object
    return node.properties.map(property => {
      const key = typeof property.key.value !== 'undefined' ? property.key.value : property.key.name;
      return [
        key,
        property.value,
      ];
    })
  } else if (node.type === 'ArrayExpression') {
    // Array
    return node.elements.map((moduleAst, moduleId) => [moduleId, moduleAst])
  } else {
    throw new ExtendedError('BundleModuleParsingError',
      'Cannot locate modules within bundle - it is not an array or an object!',
      'The module bootstrapping function was found and parsed, but no array or object',
      'containing module closures was found. This probably means that the module being parsed',
      'is something a bit unusual, and in order to unpack this bundle, a manual path to the',
      'module array must be specified by adding a "moduleClosurePath" key to the "options" object',
      `in the ${bundle.metadataFilePath} file that was created. For more information, see [INSERT LINK HERE].`,
      {foo: true}
    );
  }
}

class WebpackBootstrapNotFoundError extends Error {}
class WebpackBootstrapModuleCallExpressionNotFoundError extends Error {}

class WebpackBootstrap {
  constructor(ast, moduleCallExpression) {
    this.ast = ast;
    this.scopeManager = escope.analyze(this.ast);

    this._moduleCallExpression = moduleCallExpression;

    this.publicPath = this._getRequireFunctionProperty('p').value;
  }

  get _requireFunction() {
    let moduleCallExpression = this._moduleCallExpression;
    while (moduleCallExpression) {
      if (moduleCallExpression.type.startsWith('Function')) {
        return moduleCallExpression;
      }
      moduleCallExpression = moduleCallExpression._parent;
    }
  }

  _getRequireFunctionProperty = (propertyName) => {
    const requireFunctionName = this._requireFunction.id.name;

    const requireFunction = this.scopeManager.scopes[0].set.get(requireFunctionName);

    // Looking for an instance of soemthing like:
    // > require[propertyName] = ...
    const requireFunctionPropertyAssignment = requireFunction.references.find(reference => {
      const node = reference.identifier._parent._parent;
      return (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'MemberExpression' &&
        node.left.property.name === propertyName
      );
    })

    if (!requireFunctionPropertyAssignment) {
      return null;
    }

    const assignedValueAst = requireFunctionPropertyAssignment.identifier._parent._parent.right
    return assignedValueAst;
  }

  get entrypointModuleId() {
    // Most of the time, this is available within `require.s`. Check there first.
    const s = this._getRequireFunctionProperty('s');
    if (s && s.type === 'Literal') {
      return s.value;
    }

    // As a secondary step, try to look for an instance of something like this:
    // > require(require.foo = 906)

    const requireFunctionName = this._requireFunction.id.name;

    const requireFunction = this.scopeManager.scopes[0].set.get(requireFunctionName);

    const requireFunctionPropertyAssignment = requireFunction.references.find(reference => {
      const node = reference.identifier._parent._parent;
      return (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'MemberExpression' &&
        node.left.object.name === requireFunctionName &&
        node._parent.type === 'CallExpression' &&
        node._parent.callee.name === requireFunctionName
      );
    })

    if (!requireFunctionPropertyAssignment) {
      return null;
    }

    const assignedValueAst = requireFunctionPropertyAssignment.identifier._parent._parent.right;

    if (assignedValueAst && assignedValueAst.type === 'Literal') {
      return assignedValueAst.value;
    } else {
      return null;
    }
  }

  // Returns an array that looks like ['module', 'exports', 'require'], which indicates
  // the index of each value in the function signature of each module closure
  get moduleClosureParamIndexes() {
    const moduleCallExpression = this._moduleCallExpression;
    const [moduleThisValue, ...args] = moduleCallExpression.arguments;

    let paramIndexes = [null, null, null];

    // First, find `exports`. It will be the only `MemberExpression` in the argument list, since
    // `module.exports` is being passed.
    const exportsIndex = args.findIndex(arg => arg.type === 'MemberExpression');
    paramIndexes[exportsIndex] = 'exports';

    // Second, find module. It can be determined because the `this` value in the `.call` above is
    // module.exports.
    const moduleName = moduleThisValue.object.name;
    const moduleIndex = args.findIndex(arg => arg.name === moduleName);
    paramIndexes[moduleIndex] = 'module';

    // Finally, require is the remaining index.
    const requireIndex = paramIndexes.findIndex(i => i === null);
    paramIndexes[requireIndex] =  'require';

    return paramIndexes;
  }
}

const DEFAULT_CHUNK = 'default';

const DEFAULT_OPTIONS = {
  distPath: './dist',
  chunkFileNameSuffix: '.bundle.js',
  publicPathPrefix: '',
  chunkHttpRequestOptions: {},
  chunkNameMapping: {},
};

class Bundle {
  constructor(p) {
    this.path = p;
    if (!path.isAbsolute(this.path)) {
      // Convert `this.path` to be absolute if it is not.
      const cwd = path.resolve();
      this.path = path.join(cwd, this.path);
    }

    this.metadataFilePath = path.join(path.dirname(this.path), path.basename(this.path)+'.info');

    this.chunks = new Map();
    this.logIndentLevel = 0;

    this._options = DEFAULT_OPTIONS;
    // Add a getter / setter on the main bundle object for these options.
    for (const key in DEFAULT_OPTIONS) {
      Object.defineProperty(this, key, {
        get: () => this._options[key],
        set: value => {
          this._options = { ...this._options, [key]: value };
          this.writeMetadataFile();
        },
      });
    }

    this.readMetadataFile();
  }

  logIndent() { this.logIndentLevel += 1; }
  logDedent() { this.logIndentLevel -= 1; }
  log = (...args) => {
    let indent = '';
    for (let i = 0; i < this.logIndentLevel; i += 1) {
      indent += '  ';
    }
    console.log(`[LOG]${indent}`, ...args);
  }

  get [Symbol.toStringTag]() {
    return `bundle ${this.path}: ${this.chunks.size} chunks, ${Object.keys(this.modules).length} modules`;
  }

  parse() {
    const bundleContents = fs.readFileSync(this.path).toString();
    this.log(`Read bundle ${this.path} (${bundleContents.length} bytes)`)

    this.ast = acorn.parse(bundleContents, {});

    // Add `_parent` property to every node, so that the parent can be
    // determined in later code.
    estraverse.traverse(this.ast, {
      fallback: 'iteration',
      enter: function(node, parent) {
        node._parent = parent;
      },
    });

    this._findWebpackBootstrap();

    // Get a path to the location within the bundle where the module list occurs.
    // Should return a list of `FunctionExpression` ast nodes.
    const webpackBootstrapParent = this.webpackBootstrap.ast._parent;
    const bundleModules = parseBundleModules(webpackBootstrapParent.arguments[0], this);
    this.log(`Found ${Object.keys(bundleModules).length} modules in main bundle`);
    this.addChunk(DEFAULT_CHUNK, bundleModules);

    this.moduleTree = this._calculateModuleTree();

    this.writeMetadataFile();

    return this;
  }

  get modules() {
    return Object.fromEntries(
      Array.from(this.chunks)
        .flatMap(([id, chunk]) => Object.entries(chunk.modules))
    );
  }

  // Given anything that could be specified in a `require` call, return the module
  getModule = (moduleId) => {
    const m = this.modules[moduleId];
    if (m) {
      return m;
    } else {
      return null;
      // throw new Error('Need to implement looking up modules by path');
    }
  }

  getChunk = (chunkId) => {
    const chunkById = this.chunks.get(chunkId);
    if (chunkById) {
      return chunkById;
    }

    for (const [chunkId, chunk] of this.chunks) {
      if (chunk.fileName === chunkId) {
        return chunk;
      }

      // "main.xyx.js" => "main"
      const name = path.basename(this.fileName, path.extname(this.fileName)).split('.')[0];
      if (name === chunkId) {
        return chunk;
      }
    }

    return null;
  }
  get defaultChunk() { return this.getChunk(DEFAULT_CHUNK); }
  addChunk = (fileName, bundleModules=null) => {
    const chunk = new Chunk(this, fileName, bundleModules);
    chunk.ids.forEach(id => {
      this.chunks.set(id, chunk);
    });
    return chunk;
  }

  // Get all modules that are at the top level of the bundle (probably just one, but could be
  // multiple in theory)
  get entrypointModule() {
    return this.modules[this.webpackBootstrap.entrypointModuleId];
  }

  // Find the ast that makes up the webpack bootstrap section of the bundle
  _findWebpackBootstrap() {
    if (this.webpackBootstrap) {
      return this.webpackBootstrap;
    }
    const log = this.log;

    let webpackBootstrap, webpackBoostrapModuleCallNode;

    log(`Looking for webpackBootstrap in bundle...`);
    estraverse.traverse(this.ast.body, {
      fallback: 'iteration',
      enter: function(node, parent) {
        // Looking for this line, which invokes each module closure:
        // > modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
        function findRequireFunction() {
          let moduleCallNode = null;

          estraverse.traverse(node, {
            fallback: 'iteration',
            enter: function(n) {
              const isModuleCallNode = (
                n.type === 'CallExpression' &&
                n.callee.type === 'MemberExpression' &&
                n.callee.property.name === 'call' &&
                n.callee.object.type === 'MemberExpression' &&
                n.arguments.length === 4
              );

              if (isModuleCallNode) {
                moduleCallNode = n;
                this.break();
              }
            }
          });

          return moduleCallNode;
        }

        const requireFunction = findRequireFunction();

        const isWebpackBootstrap = (
          node &&
          node.type &&
          node.type.startsWith('Function') &&
          node.params.length === 1 &&
          node.body.type.startsWith('Block') &&
          requireFunction
        );

        if (isWebpackBootstrap) {
          log(`Found webpackBootstrap!`);
          webpackBootstrap = node;
          log(`webpackBootstrap module call expression: ${highlight(escodegen.generate(requireFunction))}`);
          webpackBoostrapModuleCallNode = requireFunction;
          this.break();
        } 
      },
    });

    if (!webpackBootstrap) {
      throw new WebpackBootstrapNotFoundError(
        [
          `Unable to locate webpackBootstrap, part of a webpack bundle that orchestrates the module system.`,
          `This is a hard requirement to be able to debundle, since it contains a bunch of metadata required`,
          `for later in the process.`,
          ``,
          `To continue, you'll need to locate the path to the 'FunctionExpression' that contains webpackBootstrap,`,
          `and put this in the metadata file generated alongside your bundle (${this.metadataFilePath})`,
          '',
          `Take a look at the documentation online for more information.`,
        ].join('\n')
      )
    }

    this.webpackBootstrap = new WebpackBootstrap(webpackBootstrap, webpackBoostrapModuleCallNode);
    return this.webpackBootstrap;
  }

  // Get a path to the location within the bundle where the module list occurs.
  // Should return a list of `FunctionExpression` ast nodes.
  get moduleClosureParamIndexes() {
    return this.webpackBootstrap.moduleClosureParamIndexes;
  }

  _calculateModuleTree() {
    // Create an object mapping the module id to an object containing the module id, the parent
    // modules, and the vhild modules.
    const tree = Object.fromEntries(
      Object.values(this.modules).map(module => [module.id, {
        id: module.id,
        _dependencyIds: module._dependencyModuleIds,
        parents: [],
        children: [],
        bare: false,
      }])
    );

    // Loop through each element in the object, populating all the children and parents.
    Object.values(tree).forEach(item => {
      item.children = item._dependencyIds.filter(a => a.moduleId !== null).flatMap(({moduleId}) => {
        if (!tree[moduleId]) {
          tree[moduleId] = { parents: [], children: [], bare: true };
        }
        const m = tree[moduleId];
        m.parents.push(item);
        return [m];
      });
      delete item._dependencyIds;
    });

    return Object.values(tree);
  }

  serialize = () => {
    return {
      version: 1,

      // Only include options that were changed from the default
      options: Object.fromEntries(
        Object.entries(this._options)
          .filter(([key, value]) => DEFAULT_OPTIONS[key] !== value)
      ),

      modules: (
        Object.values(this.modules)
          .map(m => m.serialize())
          .filter(m => m !== null)
      ),
    };
  }

  writeMetadataFile(opts={force: false}) {
    const shouldWrite = !this._metadataFileExistedAtStartOfProgram || opts.force;

    if (shouldWrite) {
      const contents = this.serialize();
      fs.writeFileSync(
        this.metadataFilePath,
        METADATA_FILE_TEMPLATE
          .replace('<JSON>', JSON.stringify(contents, null, 2))
          .replace('<PATH>', this.path),
      );
    }
  }

  readMetadataFile() {
    let metadataClosure;
    this._metadataFileExistedAtStartOfProgram = false;
    try {
      metadataClosure = require(this.metadataFilePath);
    } catch (e) {
      return;
    }
    this._metadataFileExistedAtStartOfProgram = true;


    if (typeof metadataClosure !== 'function') {
      throw new Error(`Malformed metadata file - module.exports is expected to be a function, not ${typeof metadataClosure}!`);
    }

    const data = metadataClosure();
    if (typeof data !== 'object') {
      throw new Error('Malformed metadata file - closure is expected to return an object!');
    }

    const {version, options} = data;

    if (version !== 1) {
      throw new Error(`Malformed metadata file - metadata file is version ${version}, but this program only knows how to read version 1`);
    }

    // Load all options as fields on the bundle
    for (const key in options) {
      this._options[key] = options[key] || this._options[key];
    }
  }
}


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

    this.modules = Object.fromEntries(
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
    return `chunk ${this.fileName}: ${Object.keys(this.modules).length} modules`;
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




// Thrown when a require function is encountered with multiple arguments
class RequireFunctionHasMultipleArgumentsError extends Error {}



class Module {
  constructor(chunk, moduleId, ast) {
    this.chunk = chunk;
    this.bundle = this.chunk.bundle;

    this.id = moduleId;
    this.ast = ast;

    this.path = `${chunk.ids.join('-')}-${this.id}.js`;

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
  }

  get absolutePath() {
    return path.join(this.bundle.distPath, this.path);
  }

  // Get a reference to require, module, or exports defined in the module closure
  _getModuleClosureVariable(varname) {
    const index = this.bundle.moduleClosureParamIndexes.indexOf(varname);
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

  code(opts={renameVariables: true}) {
    const originalAst = acorn.parse('var a = '+escodegen.generate(this.ast), {}).body[0].declarations[0].init;

    if (opts.renameVariables) {
      if (this.requireVariable) {
        // Adjust all require calls to contain the path to the module that is desired
        this._findAllRequireFunctionCalls().forEach(call => {
          if (!this.bundle.modules[call.moduleId]) {
            return;
          }

          const requiredModulePath = this.bundle.modules[call.moduleId].absolutePath;

          // Determine the require path that must be used to access the module requested from
          // the current module.
          call.ast.value = path.relative(
            path.dirname(this.absolutePath),
            requiredModulePath
          )
        });

        // Rename __webpack_require__ (or minified name) to require
        this.renameVariable(this.requireVariable, 'require');
      }

      const moduleVariable = this.moduleVariable;
      if (moduleVariable) {
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

    return escodegen.generate(newAst);
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

  serialize() {
    return {
      id: this.id,
      path: this.path,
    };
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
}

// const bundle = new Bundle('./bandersnatch.js');
// bundle.parse();
// const bundle = new Bundle('test_bundles/webpack/bundle.js');
const bundle = new Bundle('./spotify.js');
bundle.chunkNameMapping = {
  0: "vendors~webplayer-routes.17965baf.js",
  2: "webplayer-cef-routes.547ab6e9.js",
  3: "webplayer-routes.65d7ec93.js",
};
bundle.parse();
// bundle.addChunk('vendors~webplayer-routes.17965baf.js');

// const bundle = new Bundle('./test_bundles/density-dashboard/index.js');
// bundle.addChunk('./main.3834838d.chunk.js');
// bundle.addChunk('./2.7a878cfb.chunk.js');

// console.log(bundle.getModule(12).dependencies)
// console.log(bundle.getModule(256).dependencies)

// const bundle = new Bundle('./test_bundles/webpack-bundle-splitting/bundle.js');
// bundle.getModule(0).path = 'node_modules/uuid/index.js';
// bundle.getModule(5).path = 'node_modules/uuid/v1.js';
// bundle.getModule(6).path = 'node_modules/uuid/v4.js';
// // bundle.getModule(6).path = 'v4.js';
// bundle.getModule(8).path = 'index.js';
// bundle.writeMetadataFile()

// console.log(bundle.getModule(8).resolve('uuid'))

// Object.values(bundle.modules).slice(0, 10).forEach(m => {
//   console.log('---')
//   console.log(m.id, '=>', m.path)
//   console.log('---')
//   console.log(m.code)
// });

// console.log(bundle.getModule('L7z0')._dependencyModuleIds)

// const main = bundle.chunks.get(2).modules[10];
// for (const [key, value] of bundle.getModule('L7z0').dependencies) {
//   console.log('MODULE ID', key, !!value);
// }
// console.log(bundle.getModule(906).code())
