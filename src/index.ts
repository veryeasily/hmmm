import tonejs from '@tonejs/midi'
import fs from 'fs/promises'
import util from 'util'

function log(...args: any[]) {
    console.log(util.inspect(args, false, null, true))
}

class Composition {
    static bannedIntervals = [0, 5, 7]

    length: number
    voices: number[][]

    playhead = 0

    constructor(midis: tonejs.Midi[]) {
        this.voices = Composition.processVoices(midis, true)
        this.length = this.voices[0].length
        this.validate()
    }

    static processVoices(midis: tonejs.Midi[], loop = true) {
        const voices = midis.map((midi) => {
            return midi.tracks[0].notes.map((note) => note.midi)
        })

        if (loop) {
            for (const voice of voices) {
                voice.push(voice[0])
            }
        }

        return voices
    }

    static interval(n1: number, n2: number) {
        return (((n1 - n2) % 12) + 12) % 12
    }

    get intervalGrid() {
        const intervalGrid: number[][][] = []
        for (let cursor = 0; cursor < this.length; cursor++) {
            const intervals = this.voices.map((voice, vIdx) => {
                return this.voices.slice(vIdx + 1).map((other) => {
                    return Composition.interval(voice[cursor], other[cursor])
                })
            })
            intervalGrid.push(intervals)
        }
        return intervalGrid
    }

    get parallelMotion() {
        const grid = this.intervalGrid
        const banned = Composition.bannedIntervals

        // ic stands for interval collection
        const parallelMotion = grid.map((ic, gIdx) => {
            const nextIc = grid[gIdx + 1]
            return ic.map((intervals, icIdx) => {
                const nextIntervals = nextIc?.[icIdx]
                if (!nextIntervals) return []

                return intervals.map((int, iIdx) => {
                    if (!banned.includes(int)) {
                        return false
                    }

                    const next = nextIntervals[iIdx]
                    if (int === next) {
                        return true
                    }

                    return false
                })
            })
        })

        return parallelMotion
    }

    validate() {
        const first = this.length
        const lengths = this.voices.map((voice) => voice.length)
        if (lengths.some((length) => length !== first)) {
            throw new Error('Voices are not the same length')
        }
    }

    checkForParallelMotion() {
        const grid = this.intervalGrid
        const parallelMotion = this.parallelMotion

        log(grid)
        log(parallelMotion)

        const detected = parallelMotion.flat(2).some((check) => check)

        if (detected) {
            throw new Error('Parallel motion detected')
        }
    }
}

async function main() {
    const files = await Promise.all([
        fs.readFile('./data/voice1.mid'),
        fs.readFile('./data/voice2.mid'),
        fs.readFile('./data/voice3.mid'),
        fs.readFile('./data/voice4.mid'),
    ])

    const midis = files.map((file) => new tonejs.Midi(file))

    const composition = new Composition(midis)

    composition.checkForParallelMotion()

    console.log('No parallel motion detected!')
}

main()
