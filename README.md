# Javascript debundler

This is a project to write a parser that cann debundle browserify and webpack (and maybe more?) bundles.

Currently, it's just an experiment. But I hope to turn it into a useful tool once I've proven it
works.

## Running
```
$ cp some/random/javascript/bundle.js bundle.js
$ node index.js
$ ls dist/ # outputs an expanded version here
```
