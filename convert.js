const fs = require('fs')

fs.readFile('./td_api.tl', 'utf8' , (err, data) => {
  if (err) {
    console.error(err)
    return
  }
  fs.writeFile('./td_api.ts', transpileTL(data), (err) => {if(err)throw err;});
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
    return {
        subclass: subclass,
        properties: properties.map(property => {
            const [name, type] = property.split(':');
            return { name, type };
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
    const types = parseTlBlocks(getLines(_types));
    const functions = _functions && parseTlBlocks(getLines(_functions));
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
    type ${abstractClass} = ${abstractClasses[abstractClass].join(' | ')};`
    }

    
    transpiled+= `

    export type TdClass = ${Object.keys(abstractClasses).join(' | ')};
    
    `;

    const functionReturnTypes = {};
    for(const function_ of functions) {
        transpiled+= transpileType(function_);
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

    transpiled += `never;
}
export default TdApi;
`;

    return transpiled;
}

function transpileType(type) {
    let transpiled = `
    ${type.documentation.description ? '/** '+type.documentation.description.trim()+' */' : ''}
    export interface td_${type.type.subclass} {
        '@type': '${type.type.subclass}';`;

    for (const property of type.type.properties) {
        if(property.type.includes('<')) {
            const [name, ...types] = property.type.split('<');
            property.type= `${name}<${types.map(type => 'td_'+type).join('<')}`;
        }

        transpiled += `
        ${type.documentation[property.name] ? '/** '+type.documentation[property.name].trim()+' */' : ''}`;
        transpiled += `
        ${property.name}?: td_${property.type};`;
    }

    transpiled += `
    }
    
    `
    return transpiled;
}