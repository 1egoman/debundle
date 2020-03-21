---
id: building-a-bundler
path: "/docs/building-a-bundler"
title: Building A Bundler
parent: null
---

To better understand how tools like webpack work, let's walk through the process of building a
basic bundler.

Along the way, we'll go through some of the parts of a webpack bundle, and work
through why webpack works like it does.

```text:title=Pro&nbsp;Tip!
As you read through each example, paste each "bundle" in your browser's developer tools.
It should execute.
Try it out, confirm that it works, and try modifing something.
```

<br />

### 1. Basic Web App
Here's the web app we're going to start off bundling:

```javascript:title=index.js
var add = require('./add.js');
var result = add(5, 3);
alert(`Result: ${result}`);
```

```javascript:title=add.js
module.exports = function(a, b) {
  return a + b;
}
```

To begin, a simple approach might just to start with the `index.js` file, and concatenate all the
corresponding files together, replacing each `require` call with the code in each file.

```javascript:title=bundle.js
var add = /* start of add.js */ function(a, b) {
  return a + b;
} /* end of add.js */
var result = add(5, 3);
alert(`Result: ${result}`);
  ```

And yes, if run, that works! However, this approach quickly breaks down in a few common situations:
1. Module-level variables that should be private inside the module, and inaccessible outside the
  module
2. A module tree whose that require modules that themselves require modules (ie, a depth of > 1)

Here's an example of the first case:

```javascript:title=index.js
var add = require('./add.js');
var result = add(5, 3);
alert(`Result: ${result}`);
```

```javascript:title=add.js
var MY_CONSTANT = 5;
module.exports = function(a, b) {
  return a + b;
}
```

```javascript:title=bundle.js
var MY_CONSTANT = 5;
var add = /* start of add.js */ function(a, b) {
  return a + b;
} /* end of add.js */
var result = add(5, 3);
alert(`Result: ${result}`);
// Uh oh: MY_CONSTANT should be private to `add.js`, but is accessible within `index.js`!
// Try adding to the end of this file: console.log(MY_CONSTANT)
```

## 2. Module Closures
One of the easiest ways to solve this problem is to wrap each module in a function closure:

```javascript:title=index.js
var add = require('./add.js');
var result = add(5, 3);
alert(`Result: ${result}`);
```

```javascript:title=add.js
var MY_CONSTANT = 5;
module.exports = function(a, b) {
  return a + b;
}
```

```javascript:title=bundle.js
var add = (function() {
  var MY_CONSTANT = 5;
  return function(a, b) {
    return a + b;
  }
})();
var result = add(5, 3);
alert(`Result: ${result}`);
// Much better! MY_CONSTANT is not accessible here anymore.
```

Each module closure provides a seperate scope for each module, which is expected.

## 3. Module Caching

However, let's add a few more constants, and break them out to a separate module, and see what
happens then:
```javascript:title=index.js
var add = require('./add.js');
var { RANDOM_NUMBER } = require('./constants.js');
var result = add(5, 3);
alert(`Result: ${result}`);
```

```javascript:title=add.js
var { MY_CONSTANT, RANDOM_NUMBER } = require('./constants.js');
module.exports = function(a, b) {
  return a + b;
}
```

```javascript:title=constants.js
module.exports = {
  MY_CONSTANT: 5,
  RANDOM_NUMBER: Math.random(),
};
```

```javascript:title=bundle.js
var add = (function() {
  var { MY_CONSTANT, RANDOM_NUMBER } = (function() {
    return {
      MY_CONSTANT: 5,
      RANDOM_NUMBER: Math.random(),
    };
  })();
  return function(a, b) {
    return a + b;
  }
})();
var { RANDOM_NUMBER } = (function() {
  return {
    MY_CONSTANT: 5,
    RANDOM_NUMBER: Math.random(),
  };
})();
var result = add(5, 3);
alert(`Result: ${result}`);
```

It's good to see that the module closure approach scales to bundles of arbitrary module depth (ie,
as many levels of `require` calls as we'd like). But, this exposes some other interesting cases:
1. The constants module is repeated twice in the code. Ideally, it would be better if this was only
   in the output bundle once, and not repeated - over many dependencies, this would significantly
   reduce bundle size!
2. Currently, a bundle containing two modules with a cyclical dependency would be impossible to
   generate and be infinitely long. I'll leave it to the reader to try this exercise on their own.
3. Currently, because our bundler repeats modules like this, it doesn't match how the node module
   resolution algorithm works. Namely, `RANDOM_NUMBER`, in the two places that it is used, will be
   different values - in node, the first time a module is required it is evaluated and its results
   are **cached**, and every further time after that, the cached version is returned by the `require`
   call.

Point 3 above provides the beginnings of a solution. First, to fix the first problem, let's abstract
each module out into a named value:

```javascript:title=bundle.js
var constantsModule = (function() {
  return {
    MY_CONSTANT: 5,
    RANDOM_NUMBER: Math.random(),
  };
})();

var addModule = (function() {
  var { MY_CONSTANT, RANDOM_NUMBER } = constantsModule;
  return function(a, b) {
    return a + b;
  }
})();

var { RANDOM_NUMBER } = constantsModule;
var add = addModule;
var result = add(5, 3);
alert(`Result: ${result}`);
```

And, just to make the code a bit more readable, I'm going to convert all these bespoke variables
into an object, mapping the name of the file to the module's value:

```javascript:title=bundle.js
var modules = {};

modules['./constants.js'] = (function() {
  return {
    MY_CONSTANT: 5,
    RANDOM_NUMBER: Math.random(),
  };
})();

modules['./add.js'] = (function() {
  var { MY_CONSTANT, RANDOM_NUMBER } = modules['./constants.js'];
  return function(a, b) {
    return a + b;
  }
})();

modules['./index.js'] = (function() {
  var { RANDOM_NUMBER } = modules['./constants.js'];
  var add = modules['./add.js'];
  var result = add(5, 3);
  alert(`Result: ${result}`);
})();
```

This is great - `RANDOM_NUMBER` is now the same in every instance.

## 4. Module Ordering

But, this exposes another interesting problem: how do we know what order the modules should be
defined lexically in that object? If `index.js` was defined at the top, `modules['./constants.js']`
wouldn't exist when the `index.js` module closure is executed.

Let's change how this works a bit more so that the bundler doesn't need to figure this ordering out.
Instead of invoking each module closure, lets store the function reference, and create our own
implementation of `require` that looks through this `modules` data-structure, finds the module that
we want, executes it, caches it, and returns its value. Further invocations of `require` for the
same module will use this cached value.

```javascript
var moduleCache = {};
function require(moduleId) {
  // Return the cached module id
  if (moduleCache[moduleId]) {
    return moduleCache[moduleId];
  }

  var returnValue = modules[moduleId]();
  moduleCache[moduleId] = returnValue;
  return returnValue;
}
```

Then, at the bottom, we'll call `require('./index.js')` to run the "initial" module. Here's the
final bundle:

```javascript:title=bundle.js
var moduleCache = {};
function require(moduleId) {
  // Return the cached module id
  if (moduleCache[moduleId]) {
    return moduleCache[moduleId];
  }

  var returnValue = modules[moduleId]();
  moduleCache[moduleId] = returnValue;
  return returnValue;
}

var modules = {
  './constants.js': function() {
    return {
      MY_CONSTANT: 5,
      RANDOM_NUMBER: Math.random(),
    };
  },
  './add.js': function() {
    var { MY_CONSTANT, RANDOM_NUMBER } = require('./constants.js');
    return function(a, b) {
      return a + b;
    }
  },
  './index.js': function() {
    var { RANDOM_NUMBER } = require('./constants.js');
    var add = require('./add.js');
    var result = add(5, 3);
    alert(`Result: ${result}`);
  },
};

require('./index.js');
```

We're getting dangerously close to how webpack structures its bundles. But, there's one more big
thing.

## 5. Injecting Require, Modules, and Exports

Real bundlers are expected to maintain as much compatibility with node as possible. This means
providing access to global objects like `module`, `require`, and `exports`, so that packages from
npm will continue to function in the browser.

Each of these needs to be defined seperately for each module, since in each module scope, they hold
different values. One of the easiest ways to do this is for each module to accept these three
"module globals" as parameters in each module function.

This also means that instead of "returning" the thing to be exported from each module, we can assign
`module.exports` to it, just like one would in node!

```javascript:title=bundle.js
var moduleCache = {};

function require(moduleId) {
  // Return cached module exports value if module has already been run
  if (moduleCache[moduleId]) {
    return moduleCache[moduleId].exports;
  }

  // Create a "module" value for this module
  var _module = {
    exports: {},
    /* (note: we could add more metadata in here too,
              if desired, that would be assessible from the module) */
  };

  // Invoke module, with its own module, exports, and require values
  modules[moduleId](_module, _module.exports, require);

  // note: now `module` is being cached, instead of the module return value like before
  moduleCache[moduleId] = _module;
  return _module.exports;
}

var modules = {
  './constants.js': function(module, exports, require) {
    module.exports = {
      MY_CONSTANT: 5,
      RANDOM_NUMBER: Math.random(),
    };
  },
  './add.js': function(module, exports, require) {
    var { MY_CONSTANT, RANDOM_NUMBER } = require('./constants.js');
    module.exports = function(a, b) {
      return a + b;
    }
  },
  './index.js': function(module, exports, require) {
    var { RANDOM_NUMBER } = require('./constants.js');
    var add = require('./add.js');
    var result = add(5, 3);
    alert(`Result: ${result}`);
  },
};

require('./index.js');
```

### 6. We're done!

This is basically how webpack (and a good portion of other bundlers) work.

Webpack takes a few more small liberties, but we've rewritten all of the main pieces. Let's review:
- **A module array / object**: A datastructure that holds all the modules that the bundle contains. Each
  can be looked up by an id - depending on the bundle, this is numerical (the index of a module in
  an array) or a text string (often a 4-5 character unique string).
- **A module cache**: This stores every module when it is first invoked, and "breaks the cycle" when
  cyclical dependencies occur.
- **A require function implementation**: This orchestrates loading modules from the **module array /
  object**, stores them into the **module cache**, and ensures compatibility with node.
- **An entrypoint module**: The final line (`require('./index.js')`) defines the initial module to
  load, which is usualyl referred to as the entrypoint.

*Note: A few additional pieces can be layered on to handle additional features such as hot module
reloading or bundle splitting, but that is out of scope of this basic walkthrough.*

## A Real Webpack Bundle

Here's a real example of a webpack bundle that wold be generated from our above example. I've
annotated it with some additional comments pointing out all the critical parts.

```javascript:title=webpack.bundle.js
(function(modules) {
  // The module cache
  var installedModules = {};

  // Webpack's require function implementation
  function __webpack_require__(moduleId) {
    // Check if module is in cache
    if(installedModules[moduleId])
      return installedModules[moduleId].exports;

    // Create a new module (and put it into the cache)
    var module = installedModules[moduleId] = {
      i: moduleId,
      l: false,
      exports: {}
    };

    // Execute the module function
    modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

    // Flag the module as loaded
    module.l = true;

    // Return the exports of the module
    return module.exports;
  }

  // Expose some metadata to the module
  __webpack_require__.m = modules;
  __webpack_require__.c = installedModules;
  __webpack_require__.i = function(value) { return value; };
  __webpack_require__.d = function(exports, name, getter) {
    if(!__webpack_require__.o(exports, name)) {
      Object.defineProperty(exports, name, {
        configurable: false,
        enumerable: true,
        get: getter
      });
    }
  };
  __webpack_require__.n = function(module) {
    var getter = module && module.__esModule ?
      function getDefault() { return module['default']; } :
      function getModuleExports() { return module; };
    __webpack_require__.d(getter, 'a', getter);
    return getter;
  };
  __webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
  __webpack_require__.p = "";

  // Here's where the entrypoint is defined, and the initial require call is made to
  // kick off the web application.
  // Note: the entrypoint module has an id of `2`
  return __webpack_require__(__webpack_require__.s = 2);
})([
  // This is the module list. Because it's an array, the module ids are numeric, and are represented
  // by the index of each function in this array.

  // Module 0 (constants.js)
  (function(module, exports, __webpack_require__) {
    module.exports = {
      MY_CONSTANT: 5,
      RANDOM_NUMBER: Math.random(),
    };
  }),

  // Module 1 (add.js)
  (function(module, exports, __webpack_require__) {
    const { MY_CONSTANT, RANDOM_NUMBER } = __webpack_require__(0);
    module.exports = function(a, b) {
      return a + b;
    }
  }),

  // Module 2 (index.js)
  (function(module, exports, __webpack_require__) {
    const { RANDOM_NUMBER } = __webpack_require__(0);
    const add = __webpack_require__(1);
    const result = add(5, 3);
    alert(`Result: ${result}`);
  })
]);
```
**If you'd like to generate this bundle yourself, try running the below on your own system:**
```bash
$ npm install -g webpack
$ # Create index.js, add.js, and constants.js
$ webpack index.js webpack.bundle.js
$ # Take a look at bundle.js
```

Next, read [Anatomy of a Bundle](/docs/anatomy-of-a-bundle).
