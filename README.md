# Tdweb Typescript types

The [Tdweb NPM package](https://npmjs.com/package/tdweb) does have type definitions, but those type definitions do not cover the JSON API.

Here you can use type definitions for JSON API of Tdweb. There is a prebuilt type definition, an example file to show how to use it, and a generator so you can generate it from your own td_api.tl

Note: Your PC needs to be powerful enough to process 600KB of type definitions for every word you type.

## Generation

To generate a TypeScript type definitions file:

1. Install Node.js if you don't have it
2. Copy `convert.js` and `td_api.tl` to the same folder
3. Run `node convert.js`

   Note: By default, the generator includes differences between Tdweb API and JSON API. To disable this behavior, pass the `--disable-tdweb-additional-types` flag when running the generator.
