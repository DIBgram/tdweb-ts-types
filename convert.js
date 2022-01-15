const fs = require('fs')

const useOptions= fs.existsSync('./options.txt');
fs.readFile('./td_api.tl', 'utf8' , (err, data) => {
  if (err) {
    console.error(err)
    return
  }
  fs.writeFile('./td_api.d.ts', transpileTL(data), (err) => {if(err)throw err;});
})

/** @param {string} line */
function parseTlType(line) {
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
                    return {name, type: 'td_blob'};
                }
            }
            return { name, type: 'td_'+type.replace(/</g, '<td_') };
        }),
        abstractClass: right.trim().slice(0, -1),
    }
}

function getLines(text) {
    return text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
}

// Separates blocks of TL types.
// Each TL block consists of zero or more comment lines (starting with double-slash) and one TL definition (not starting with double-slash).
function parseTlBlocks(lines) {
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
 * @param {string} documentation
 */
function parseDocumentation(documentation) {
    if(!documentation.includes('@')) 
        return {};
    var obj= {};
    const parts = documentation.split('@');
    parts.slice(1).forEach((part) => {
        const [name, ...description] = part.split(' ');
        obj[name] = description.join(' ');
    })
    return obj;
}

/**
 * 
 * @param {string} text 
 * @returns 
 */
function parseTlFile(text) {
    var [_types, _functions] = text.split('---functions---');
    var types = parseTlBlocks(getLines(_types));
    var functions = _functions && parseTlBlocks(getLines(_functions));

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

function transpileTL(tl_source) {
    const tl= parseTlFile(tl_source);
    const { types, functions } = tl;
    var transpiled= `
namespace TdApi {
    type td_double = number;
    type td_string = string;
    type td_int32 = number;
    type td_int53 = number;
    type td_int64 = string;
    type td_bytes = string;

    type td_Bool = boolean;

    type td_vector<t> = t[];

    `;

    if(process.argv[2] !== '--disable-tdweb-additional-types' ){
        transpiled+= `
    type td_blob= Blob;
    type td_jsLogLevel= 'error' | 'warning' | 'info' | 'log' | 'debug';

    `
    }

    const abstractClasses = {};

    for(const type of types) {
        if(abstractClasses['td_'+type.type.abstractClass]) {
            abstractClasses['td_'+type.type.abstractClass].push('td_'+type.type.subclass);
        } else {
            abstractClasses['td_'+type.type.abstractClass] = ['td_'+type.type.subclass];
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

    const functionReturnTypes = {};
    for(const function_ of functions) {
        transpiled+= transpileType(function_, true);
        functionReturnTypes['td_' +function_.type.subclass] = 'td_' +function_.type.abstractClass;
    }

    transpiled+= `export type TdFunction = ${Object.keys(functionReturnTypes).join(' | ')};
    `;

    transpiled+= `export type TdFunctionReturn<t> = 
    `;

    for(const functionReturnType in functionReturnTypes) {
        transpiled+= `t extends ${functionReturnType} ? ${functionReturnTypes[functionReturnType]} :
        `
    }

    transpiled+= `never
    
    export type TdUpdateType<t> = 
    `;

    for(const updateType of abstractClasses['td_Update']) {
        transpiled+= `t extends ${updateType} ? "${updateType.slice(3)}" :
        `
    }

    transpiled += `never;${
    transpileOptions()}
}
export default TdApi;
`;

    return transpiled;
}

function transpileType(type, isFunction) {
    let transpiled = `
    ${type.documentation.description ? '/** '+type.documentation.description.trim()+' */' : ''}
    export interface td_${type.type.subclass} {
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

function transpileOptions() {
    if(!useOptions) {
        console.warn('options.txt not found. Skipping options.');
        return '';
    }
    const options = fs.readFileSync('./options.txt', 'utf8').split('\n');

    return `

    /** Dictionary which contains TDLib options, suitable for a global options storage */
    export interface TdOptions { 
        ${ options.map(line => {
            let [name, type, writable, description]= line.split('\t');
            return (
            `/** ${description.trim()} */
        ${name}?: td_optionValue${type};`
            );
        }).join('\n\n        ')}

        [key: string]: td_OptionValue; // The app can store custom options with name starting with 'x-' or 'X-'.
    }
    
    /** Similar to \`TdOptions\` but contains the values themselves instead of \`OptionValue\`. */
    export interface TdOptions_pure {
        ${ options.map(line => {
            let [name, type, writable, description]= line.split('\t');
            const pureType= {
                "Integer": "int64",
                "Boolean": "Bool",
                "String": "string",
            }[type];
            return (
            `/** ${description.trim()} */
        ${name}?: td_${pureType};`
            );
        }).join('\n\n        ')}
    }

    export type TdOptionKey= ${options.map(line=>"'"+line.split('\t')[0]+"'").join(' | ')} | \`x-\${string}\` | \`X-\${string}\`;

    export type TdOptionKey_writable = ${options.filter(line=>line.split('\t')[2]==='Yes').map(line=>"'"+line.split('\t')[0]+"'").join(' | ')} | \`x-\${string}\` | \`X-\${string}\`;

    export type TdOptionType<T extends TdOptionKey | TdOptionKey_writable, U extends T>=
        ${options.map((line)=> {
            let [name, type]= line.split('\t');
            return `U extends "${name}" ? td_optionValue${type} :`
        }).join('\n        ')}
        T;
    `;
}
