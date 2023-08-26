import { Composition } from './composition.js'

describe('Composition', () => {
    it('should create a composition', async () => {
        await Composition.createFromPaths([
            './stubs/voice1.mid',
            './stubs/voice2.mid',
            './stubs/voice3.mid',
            './stubs/voice4.mid',
        ])
    })
})
