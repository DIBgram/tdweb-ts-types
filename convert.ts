import fs = require('fs');

type TLType = {
    subclass: string;
    properties: {
        name: string;
        type: string;
    }[];
    abstractClass: string;
};

type TLDeclaration = {
    documentation: Record<string, string>;
    type: TLType;
}

type Option = {
    type: string;
    writable: boolean;
    description: string;
}

const useOptions= fs.existsSync('./options.txt');
fs.readFile('./td_api.tl', 'utf8' , (err, data) => {
  if (err) {
    console.error(err)
    return
  }
  const types = parseTlFile(data);
  fs.writeFile('./td_api.d.ts', transpileTypes(types), (err) => {if(err)throw err;});
  fs.writeFile('./td_api.json', JSON.stringify({...types, options: parseOptions()}), (err) => {if(err)throw err;});
})

function parseTlType(line: string) {
    const [left, right] = line.split('=');
    const [subclass, ...properties] = left.trim().split(' ');
    if([
        'double',
        'string',
        'int32',
        'int53',
        'int64',
        'bytes',
        'boolTrue',
        'boolFalse',
        'vector',
    ].includes(subclass)) {
        return null;
    }
    if(process.argv[2] !== '--disable-tdweb-additional-types' ){
        if([ // Not supported on tdweb
            'getStorageStatistics',
            'getStorageStatisticsFast',
            'optimizeStorage',
            'addProxy',
            'getFileDownloadedPrefixSize',
        ].includes(subclass)) {
            return null;
        }
    }
    return {
        subclass: subclass,
        properties: properties.map(property => {
            const [name, type] = property.split(':');
            if(process.argv[2] !== '--disable-tdweb-additional-types' ){
                if(subclass==='filePart' && name==='data'){
                    return {name, type: 'Blob'};
                }
            }
            return { name, type };
        }),
        abstractClass: right.trim().slice(0, -1),
    }
}

function getLines(text: string) {
    return text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
}

// Separates blocks of TL types.
// Each TL block consists of zero or more comment lines (starting with double-slash) and one TL definition (not starting with double-slash).
function parseTlBlocks(lines: string[]) {
    const blocks = [];
    let block = [];
    for (const line of lines) {
        if (line.startsWith('//')) {
            block.push(line.slice(2));
        } else {
            const type= parseTlType(line);
            const documentation = parseDocumentation(block.join(' '));
            type && blocks.push({documentation, type});
            block = [];
        }
    }
    return blocks;
}

/**Parses a TL type documentation
 * Each TL documentation has zero or more parts, each starting with an at-sign, immediately followed by a name. Everything after the name until the next at-sign is the documentation.
 */
function parseDocumentation(documentation: string) {
    if(!documentation.includes('@')) 
        return {};
    var obj: Record<string, string>= {};
    const parts = documentation.split('@');
    parts.slice(1).forEach((part) => {
        const [name, ...description] = part.split(' ');
        obj[name] = description.join(' ');
    })
    return obj;
}

function parseTlFile(text: string) {
    var [_types, _functions] = text.split('---functions---');
    var types = parseTlBlocks(getLines(_types));
    var functions = _functions ? parseTlBlocks(getLines(_functions)) : [];

    if(process.argv[2] !== '--disable-tdweb-additional-types' ){
        types= [
            ...types,
            ...parseTlBlocks([
                '//@description TDLib has encountered a fatal error',
                '//@error Error message',
                'updateFatalError error:string = Update;',

                '//@description A file from a JavaScript Blob',
                '//@data JavaScript blob containing file data',
                'inputFileBlob data:blob = InputFile;'
            ])
        ]

        functions= [
            ...functions,
            ...parseTlBlocks([
                '//@description Changes the verbosity level of TDWeb logging',
                '//@new_verbosity_level New value of the verbosity level for logging.',
                'setJsLogVerbosityLevel new_verbosity_level:jsLogLevel = Ok;'
            ])
        ]
    }

    return {types, functions};
}

function transpileTypes({types, functions}: ReturnType<typeof parseTlFile>) {
    var transpiled= `
namespace TdApi {
    type double = number;
    type int32 = number;
    type int53 = number;
    type int64 = string;
    type bytes = string;

    type Bool = boolean;

    type vector<t> = t[];

    `;

    if(process.argv[2] !== '--disable-tdweb-additional-types' ){
        transpiled+= `
    type jsLogLevel= 'error' | 'warning' | 'info' | 'log' | 'debug';

    `
    }

    const abstractClasses: Record<string, string[]> = {};

    for(const type of types) {
        if(abstractClasses[type.type.abstractClass]) {
            abstractClasses[type.type.abstractClass].push(type.type.subclass);
        } else {
            abstractClasses[type.type.abstractClass] = [type.type.subclass];
        }
        transpiled+= transpileType(type)
    };

    for(const abstractClass in abstractClasses) {
        transpiled+= `
    export type ${abstractClass} = ${abstractClasses[abstractClass].join(' | ')};`
    }

    
    transpiled+= `

    export type TdClass = ${Object.keys(abstractClasses).join(' | ')};
    
    `;

    const functionReturnTypes: Record<string, string> = {};
    for(const function_ of functions) {
        transpiled+= transpileType(function_, true);
        functionReturnTypes[function_.type.subclass] = function_.type.abstractClass;
    }

    transpiled+= `export type TdFunction = ${Object.keys(functionReturnTypes).join(' | ')};
    `;

    transpiled+= `export type TdFunctionReturn<t> = 
    `;

    for(const functionReturnType in functionReturnTypes) {
        transpiled+= `t extends ${functionReturnType} ? ${functionReturnTypes[functionReturnType]} :
        `
    }

    transpiled+= `never${
    transpileOptions()}
}
export default TdApi;
`;

    return transpiled;
}

function transpileType(type: TLDeclaration, isFunction?: boolean) {
    let transpiled = `
    ${type.documentation.description ? '/** '+type.documentation.description.trim()+' */' : ''}
    export interface ${type.type.subclass} {
        '@type': '${type.type.subclass}';`;

    for (const property of type.type.properties) {
        const doc= type.documentation[property.name];
        const optional= isFunction || (doc.includes('may be null') ? '?' : '');

        transpiled += `
        ${ doc? '/** '+doc.trim()+' */' : ''}`;
        transpiled += `
        ${property.name}${optional? '?' : ''}: ${property.type};`;
    }

    transpiled += `
    }
    
    `
    return transpiled;
}

function parseOptions() {
    if(!useOptions) return {};
    const options: Record<string, Option> = {};
    const lines = fs.readFileSync('./options.txt', 'utf8').split('\n');
    for (const line of lines) {
        let [name, type, writable, description]= line.split('\t');
        options[name] = {type, writable: writable==='Yes', description};
    }
    return options;
}

function transpileOptions() {
    if(!useOptions) {
        console.warn('options.txt not found. Skipping options.');
        return '';
    }

    const options = parseOptions();

    return `

    /** Dictionary which contains TDLib options, suitable for a global options storage */
    export interface TdOptions { 
        ${ Object.entries(options).map(([name, {description, type}]) => {
            return (
            `/** ${description.trim()} */
        ${name}?: optionValue${type};`
            );
        }).join('\n\n        ')}

        [key: string]: OptionValue; // The app can store custom options with name starting with 'x-' or 'X-'.
    }
    
    /** Similar to \`TdOptions\` but contains the values themselves instead of \`OptionValue\`. */
    export interface TdOptions_pure {
        ${ Object.entries(options).map(([name, {description, type}]) => {
            const pureType: "string" | "int64" | "Bool" | undefined = ({
                "Integer": "int64",
                "Boolean": "Bool",
                "String": "string",
            } as const)[type];
            return (
            `/** ${description.trim()} */
        ${name}?: ${pureType};`
            );
        }).join('\n\n        ')}
        
        [key: string]: string | Bool | int64; // The app can store custom options with name starting with 'x-' or 'X-'.
    }

    export type TdOptionKey= ${Object.keys(options).map(name=>`'${name}'`).join(' | ')} | \`x-\${string}\` | \`X-\${string}\`;

    export type TdOptionKey_writable = ${Object.entries(options).filter(([, {writable}])=>writable).map(([name])=>`'${name}'`).join(' | ')} | \`x-\${string}\` | \`X-\${string}\`;

    export type TdOptionType<T extends TdOptionKey | TdOptionKey_writable, U extends T>=
        ${Object.entries(options).map(([name, {type}])=> {
            return `U extends "${name}" ? optionValue${type} :`
        }).join('\n        ')}
        T;
    `;
}
