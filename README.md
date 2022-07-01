# Tdweb Typescript types

The [Tdweb NPM package](https://npmjs.com/package/tdweb) does have type definitions, but those type definitions do not cover the JSON API.

Here you can use type definitions for JSON API of Tdweb. There is a prebuilt type definition, an example file to show how to use it, and a generator so you can generate it from your own td_api.tl

Note: Your PC needs to be powerful enough to process 600KB of type definitions for every word you type.

## Generation

To generate a TypeScript type definitions file from your own `td_api.tl` file:

1. Install Node.js if you don't have it
2. Clone this repository and run `npm install`
3. Replace `td_api.tl` in the folder with your version
4. _[Optional]_ Copy the contents of the table in <https://core.telegram.org/tdlib/options> and save it in `options.txt` (rows separated by line breaks, cells separated by tabs). Doing this will add TDLib options types to generated types.
5. Run `npm start`

   Note: By default, the generator includes some differences between Tdweb API and JSON API. To disable this behavior, use the following command:
   `npm start -- --disable-tdweb-additional-types`
