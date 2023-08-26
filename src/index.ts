import tonejs from '@tonejs/midi'
import fs from 'fs/promises'
import util from 'node:util'

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
    }

    /**
     * We throw away all the midi data except the notes. Also, assuming that the
     * MIDI is a loop, then we add the first note to the end of the array. In
     * terms of visualizing this, this will be a matrix where each element
     * (t, i) is the note played by voice i at time t.
     */
    static processVoices(midis: tonejs.Midi[], loop = true) {
        return midis.map((midi) => {
            const notes = midi.tracks[0].notes.map((note) => note.midi)
            if (loop) {
                notes.push(notes[0])
            }
            return notes
        })
    }

    /**
     * Javascript modulo operator is not mathematically correct for negative
     * numbers. This function returns the correct modulo for negative intervals.
     */
    static interval(n1: number, n2: number) {
        return (((n1 - n2) % 12) + 12) % 12
    }

    /**
     * Interval grid is a time indexed array of symmetric matrices where each
     * element (t, i, j) is the interval between voice i and voice j at time t.
     * Since the matrix is symmetric, only the upper triangle is stored.
     */
    get intervalGrid() {
        const intervalGrid: number[][][] = []
        for (let t = 0; t < this.length; t++) {
            if (!intervalGrid[t]) intervalGrid[t] = []

            for (let i = 0; i < this.voices.length; i++) {
                if (!intervalGrid[t][i]) intervalGrid[t][i] = []

                const voice = this.voices[i]
                for (let j = i + 1; j < this.voices.length; j++) {
                    const other = this.voices[j]
                    const interval = Composition.interval(voice[t], other[t])
                    intervalGrid[t][i].push(interval)
                }
            }
        }
        return intervalGrid
    }

    /**
     * Parallel motion is a time indexed array of symmetric matrices where each
     * element (t, i, j) is true if voice i and voice j will move in parallel
     * at time t for some banned interval. Since the matrix is symmetric, only
     * the upper triangle is stored.
     */
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

    validateLength() {
        const first = this.length
        const lengths = this.voices.map((voice) => voice.length)
        if (lengths.some((length) => length !== first)) {
            throw new Error('Voices are not the same length')
        }
    }

    validate() {
        this.validateLength()

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
    composition.validate()

    console.log('No parallel motion detected!')
}

main()
