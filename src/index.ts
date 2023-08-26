import tonejs from '@tonejs/midi'
import fs from 'fs/promises'

function log(...args: any[]) {
    console.dir(args, { depth: null })
}

/**
 * A composition is a collection of voices. Each voice is a time indexed array
 * of notes given by their MIDI number (for example, middle C is 60). The
 * composition is valid if there is no parallel motion between any two voices as
 * time advances.
 */
class Composition {
    static bannedIntervals = [0, 5, 7]

    length: number
    voices: number[][]

    playhead = 0

    /**
     * MIDI can technically store more than one track per file, but we're
     * assuming that each file only has one track. We also assume that the MIDI
     * is a loop, so we add the first note to the end of the array. This helps
     * us later because you can have parallel motion at the end of a loop.
     */
    constructor(midis: tonejs.Midi[]) {
        this.voices = Composition.processVoices(midis, true)
        this.length = this.voices[0].length
    }

    static create(midis: tonejs.Midi[]) {
        const composition = new Composition(midis)
        composition.validate()
        return composition
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
     * Interval grid is a time-indexed array of symmetric matrices where each
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
     * Parallel motion grid is a time-indexed array of boolean symmetric
     * matrices where each element (t, i, j) is true if voice i and voice j will
     * move in parallel at time t for some banned interval. Since the matrix is
     * symmetric, only the upper triangle is stored.
     */
    get parallelMotionGrid() {
        const grid = this.intervalGrid
        const banned = Composition.bannedIntervals

        const parallelMotion = grid.map((matrix, t) => {
            const nextMatrix = grid[t + 1]

            return matrix.map((intervals, i) => {
                const nextIntervals = nextMatrix?.[i]
                if (!nextIntervals) return []

                return intervals.map((interval, j) => {
                    if (!banned.includes(interval)) {
                        return false
                    }

                    const next = nextIntervals[j]
                    if (interval === next) {
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
        const motion = this.parallelMotionGrid

        const a: any = {}
        a.b = 1
        a.c = a
        console.log(util.inspect(a, false, null, true))

        log(grid)
        log(motion)

        const detected = motion.flat(2).some((check) => check)

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
    Composition.create(midis)

    console.log('No parallel motion detected!')
}

main()
