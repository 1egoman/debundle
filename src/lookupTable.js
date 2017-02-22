const acorn = require('acorn');
// - index
//   - foo
// - node_modules
//   - my-package
//     - index
//     - bar
//     - baz
//       - index

const modules = [
  {
    id: 1
    code: function(module, process, require) {
      "1 ./foo";
      const foo = require('./foo');
      const package = require('my-package');
    },
    lookup: {'./foo': 2, 'my-package': 3},
  },
  {
    id: 2,
    code: function(module, process, require) {
      "2 ./foo";
    },
    lookup: {},
  },
  {
    id: 3,
    code: function(module, process, require) {
      "3 my-package";
      const bar = require('./bar');
      const baz = require('./baz/hello');
    },
    lookup: {'./bar': 4, './baz/hello': 5},
  },
  {
    id: 4,
    code: function(module, process, require) {
      "4 ./bar";
    },
    lookup: {},
  },
  {
    id: 5,
    code: function(module, process, require) {
      "5 ./baz/hello";
    },
    lookup: {'../bar': 4},
  },
];

function createLookupTable(modules) {
  return modules.
}

createLookupTable(modules);
