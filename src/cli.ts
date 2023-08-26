#!/usr/bin/env node
import { cac } from 'cac'
import c from 'picocolors'
import { Composition } from './composition.js'

const cli = cac('hmmm')

cli.help()

cli.command('demo').action(demo)

cli.command('run [...files]', 'Run the program').action(run)

cli.parse()

async function demo() {
    await Composition.createFromPaths([
        './stubs/voice1.mid',
        './stubs/voice2.mid',
        './stubs/voice3.mid',
        './stubs/voice4.mid',
    ])

    console.log('No parallel motion detected!')
}

async function run(cliFiles: string[]): Promise<void> {
    await Composition.createFromPaths(cliFiles)

    console.log(`\n${c.green('Success')}: No parallel motion detected!`)
}
