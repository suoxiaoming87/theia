/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

const path = require('path');
const { promises: fsp } = require('fs');
const { theiaReExports } = require('../package.json');

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const exportStar = theiaReExports['export *'];
    const exportEqual = theiaReExports['export ='].map(entry => {
        const [package, ns = entry] = entry.split(' as ', 2);
        return [package, ns];
    });
    await Promise.all([
        generateExportElectron(),
        Promise.all(exportStar.map(package => generateExportStar(package))),
        Promise.all(exportEqual.map(([package, ns]) => generateExportEqual(package, ns))),
        generateMarkdown([
            ...exportStar,
            ...exportEqual.map(([package, ns]) => package),
        ].sort()),
    ]);
}

async function generateMarkdown(reExports) {
    await fsp.writeFile(path.resolve(__dirname, '../EXPORTS.md'), `\
# @theia/core re-exports

In order to make application builds more stable \`@theia/core\` re-exports some common dependencies
for Theia extensions to re-use.

## Usage example

Let's take inversify as an example since you will most likely use this package, you can import this
package by prefixing with \`@theia/core/shared/\`:

\`\`\`ts
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class SomeClass {
    // ...
}
\`\`\`

## List of re-exported packages

${reExports.map(package => ` - \`${package}\``).join('\n')}
`);
}

/**
 * @theia/electron is optional, so it is expected to miss this package.
 */
async function generateExportElectron() {
    const base = path.resolve(__dirname, '../shared/electron');
    await Promise.all([
        writeFileIfMissing(`${base}.js`, `\
module.exports = undefined;
try {
    module.exports = require('@theia/electron');
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
        console.warn('@theia/electron not found');
    } else {
        throw error;
    }
}
`),
        writeFileIfMissing(`${base}.d.ts`, `\
import Electron = require('@theia/electron');
export = Electron;
`),
    ]);
}

async function generateExportStar(package) {
    const base = await prepareSharedPackage(package);
    await Promise.all([
        writeFileIfMissing(`${base}.js`, `\
const { __exportStar } = require('tslib');
__exportStar(require('${package}'), exports);
`),
        writeFileIfMissing(`${base}.d.ts`, `\
export * from '${package}';
`),
    ]);
}

async function generateExportEqual(package, ns) {
    const base = await prepareSharedPackage(package);
    await Promise.all([
        writeFileIfMissing(`${base}.js`, `\
module.exports = require('${package}');
`),
        writeFileIfMissing(`${base}.d.ts`, `\
import ${ns} = require('${package}');
export = ${ns};
`),
    ]);
}

async function prepareSharedPackage(package) {
    const base = path.resolve(__dirname, '../shared', package);
    // Handle "@some/package" cases that require sub-folders
    await fsp.mkdir(path.dirname(base), { recursive: true });
    return base;
}

async function writeFileIfMissing(file, content) {
    if (await fsp.access(file).then(() => false, error => true)) {
        await fsp.writeFile(file, content);
    }
}
