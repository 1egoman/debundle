const Bundle = require('./subcomponents/Bundle');

const bundle = new Bundle(process.argv[process.argv.length-1]);
bundle.parse()

const promises = [];
for (const [key, value] of bundle.modules) {
  promises.push(value.write());
}
Promise.all(promises).then(() => console.log('Done.'));
