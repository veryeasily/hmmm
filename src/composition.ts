import tonejs from '@tonejs/midi'
import fs from 'node:fs/promises'
import util from 'node:util'

// const DEBUG = process.env.HMMM_DEBUG === 'true'
const DEBUG = false

function log(...args: any[]) {
    const output = args
        .map((arg) => util.inspect(arg, { depth: null, colors: true }))
        .join(' ')
    console.log(output)
}

/**
 * A composition is a collection of voices. Each voice is a time indexed array
 * of notes given by their MIDI number (for example, middle C is 60). The
 * composition is valid if there is no parallel motion between any two voices as
 * time advances.
 */
export class Composition {
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
    constructor(files: Buffer[]) {
        const midis = files.map((file) => new tonejs.Midi(file))
        this.voices = Composition.processMidis(midis, true)
        this.length = this.voices[0].length
    }

    static create(files: Buffer[]) {
        const composition = new Composition(files)
        composition.validate()
        return composition
    }

    static async createFromPaths(paths: string[]) {
        const files = await Promise.all(paths.map((path) => fs.readFile(path)))
        return Composition.create(files)
    }

    /**
     * We throw away all the midi data except the notes. Also, assuming that the
     * MIDI is a loop, then we add the first note to the end of the array. In
     * terms of visualizing this, this will be a matrix where each element
     * (t, i) is the note played by voice i at time t.
     */
    static processMidis(midis: tonejs.Midi[], loop = true) {
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
     * The timeline is a time-indexed array of symmetric matrices where each
     * element (t, i, j) is the interval between voice i and voice j at time t.
     * Since the matrix is symmetric, only the upper triangle is stored.
     */
    get timeline() {
        const timeline: number[][][] = []
        for (let t = 0; t < this.length; t++) {
            if (!timeline[t]) timeline[t] = []

            for (let i = 0; i < this.voices.length; i++) {
                if (!timeline[t][i]) timeline[t][i] = []

                const voice = this.voices[i]
                for (let j = i + 1; j < this.voices.length; j++) {
                    const other = this.voices[j]
                    const interval = Composition.interval(voice[t], other[t])
                    timeline[t][i][j] = interval
                }
            }
        }
        return timeline
    }

    /**
     * The motion timeline is a time-indexed array of boolean symmetric matrices
     * where each element (t, i, j) is true if voice i and voice j will move in
     * parallel at time t for some banned interval. Since the matrix is
     * symmetric, only the upper triangle is stored.
     */
    get motionTimeline() {
        const timeline = this.timeline
        const banned = Composition.bannedIntervals

        const mTimeline = timeline.map((matrix, t) => {
            const nextMatrix = timeline[t + 1]

            const result: boolean[][] = []
            for (let i = 0; i < matrix.length; i++) {
                const intervals = matrix[i]
                const nextIntervals = nextMatrix?.[i]
                if (!result[i]) result[i] = []
                if (!nextIntervals) continue

                for (let j = i + 1; j < intervals.length; j++) {
                    const interval = intervals[j]
                    const next = nextIntervals[j]
                    const isBanned = banned.includes(interval)
                    result[i][j] = isBanned && interval === next
                }
            }
            return result
        })

        return mTimeline
    }

    validate() {
        this.validateLength()

        if (DEBUG) {
            const timeline = this.timeline
            const mTimeline = this.motionTimeline
            log('timeline', timeline)
            log('mTimeline', mTimeline)
        }

        this.validateMotion()
    }

    validateLength() {
        const first = this.length
        const lengths = this.voices.map((voice) => voice.length)
        if (lengths.some((length) => length !== first)) {
            throw new Error('Voices are not the same length')
        }
    }

    validateMotion() {
        let detected = false
        let message = ''

        for (const [t, matrix] of this.motionTimeline.entries()) {
            for (const [i, row] of matrix.entries()) {
                for (const [j, check] of row.entries()) {
                    if (check) {
                        detected = true
                        message += `Parallel motion detected at time ${t} between voices ${i + 1} and ${j + 1}\n`
                    }
                }
            }
        }

        if (detected) {
            throw new Error(message)
        }
    }
}
