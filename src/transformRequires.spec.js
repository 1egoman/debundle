const assert = require('assert');

const transformRequires = require('./transformRequires');

const {
  generateFunction,
  generateMangledFunction,
  generateRequire,
  generateMangledRequire,
  generateVariableAssignment,
} = require('./testHelpers');

// Tests just using filenames that relate to module ids (ie, ./2.js)

it('1: require(2) => 1: require("./2")', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('./2')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
  };
  const entryPointModuleId = 1;
  const type = "webpack";
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

// Tests involving relative paths

it('1: require(2) => 1: require("./foo/bar/baz") where (2 = ./foo/bar/baz)', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('./foo/bar/baz')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
    2: './foo/bar/baz',
  };
  const entryPointModuleId = 1;
  const type = "webpack";
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

it('1: require(2) => 1: require("./bar/baz") where (1 = ./foo/index, 2 = ./foo/bar/baz)', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('./bar/baz')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
    1: './foo/index',
    2: './foo/bar/baz',
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

it('1: require(2) => 1: require("../hello") where (1 = ./foo/bar/baz/index, 2 = ./foo/hello)', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('../../hello')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
    1: './foo/bar/baz/index',
    2: './foo/hello',
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

// Tests involving `node_modules`

it('1: require(2) => 1: require("foo") where (1 = ./foo/bar/baz/index, 2 = foo)', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('foo')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
    1: './foo/bar/baz/index',
    2: 'foo',
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

it('1: require(2) => 1: require("foo/bar") where (1 = ./foo/bar/baz/index, 2 = foo/bar)', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('foo/bar')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
    1: './foo/bar/baz/index',
    2: 'foo/bar',
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

// Tests involving looking up module paths to programatically determine where modules are located.

it('1: require(2) => 1: require("./foo")', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
      lookup: {'./foo': 2},
    },
    {
      id: 2,
      code: generateFunction(),
      lookup: {},
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('./foo')
      ),
      lookup: {'./foo': 2},
    },
    {
      id: 2,
      code: generateFunction(),
      lookup: {},
    },
  ];


  const knownPaths = {
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

it('1: require(2) => 1: require("./bar/baz")', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
      lookup: {'./bar/baz': 2},
    },
    {
      id: 2,
      code: generateFunction(),
      lookup: {},
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('./bar/baz')
      ),
      lookup: {'./bar/baz': 2},
    },
    {
      id: 2,
      code: generateFunction(),
      lookup: {},
    },
  ];


  const knownPaths = {
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

it('1: require(2) => 1: require("foo")', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        generateRequire(2)
      ),
      lookup: {'foo': 2},
    },
    {
      id: 2,
      code: generateFunction(),
      lookup: {},
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateFunction(
        generateRequire('foo')
      ),
      lookup: {'foo': 2},
    },
    {
      id: 2,
      code: generateFunction(),
      lookup: {},
    },
  ];

  const knownPaths = {
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

// Tests with a require call containing a variable

it('1: require(variable) => 1: require(variable)', () => {
  const modules = [
    {
      id: 1,
      code: generateFunction(
        {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: 'require',
          },
          arguments: [{
            type: 'Identifier',
            name: 'require',
          }],
        }
      ),
      lookup: {'./foo': 2},
    },
    {
      id: 2,
      code: generateFunction(),
      lookup: {},
    },
  ];
  const expectedOutput = modules;


  const knownPaths = {
  };
  const type = "webpack";
  const entryPointModuleId = 1;
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

// Tests with mangled variables in the closure surrounding the module

it('1: mangledRequire(2) => 1: mangledRequire("./2")', () => {
  const modules = [
    {
      id: 1,
      code: generateMangledFunction(
        generateMangledRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateMangledFunction(
        generateMangledRequire('./2')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
  };
  const entryPointModuleId = 1;
  const type = "webpack";
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type);

  assert.deepEqual(output, expectedOutput);
});

// Tests replaceRequires = `variable`, such that when set, requires are aliased at the top of the
// module closure instead of replaced.

it('1: mangledRequire(2) => 1: mangledRequire("./2")   (where replaceRequires = variable)', () => {
  const modules = [
    {
      id: 1,
      code: generateMangledFunction(
        generateMangledRequire(2)
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];
  const expectedOutput = [
    {
      id: 1,
      code: generateMangledFunction(
        generateVariableAssignment('mangledExports', {type: 'Identifier', name: 'exports'}),
        generateVariableAssignment('mangledModule', {type: 'Identifier', name: 'module'}),
        generateVariableAssignment('mangledRequire', {type: 'Identifier', name: 'require'}),
        generateMangledRequire('./2')
      ),
    },
    {
      id: 2,
      code: generateFunction(),
    },
  ];


  const knownPaths = {
  };
  const entryPointModuleId = 1;
  const type = "webpack";
  const replaceRequires = "variable";
  const output = transformRequires(modules, knownPaths, entryPointModuleId, type, replaceRequires);

  assert.deepEqual(output, expectedOutput);
});
