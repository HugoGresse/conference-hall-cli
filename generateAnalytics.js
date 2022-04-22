const { program } = require('commander')
const fs = require("fs")
const ora = require('ora')


const main = async () => {
    program.parse(process.argv)

    if (program.debug) {
        console.log(program.opts())
    }

    // Does speakersAndProposals.json file exist?
    const speakersAndProposalsFile = `${__dirname}/speakersAndProposals.json`
    if (!fs.existsSync(speakersAndProposalsFile)) {
        console.log(`${speakersAndProposalsFile} does not exist.`)
        process.exit(1)
    }

    const fileContents = JSON.parse(fs.readFileSync(speakersAndProposalsFile, 'utf8'))

    const proposals = fileContents.proposals
    const speakers = fileContents.speakers
    const speakersById = speakers.reduce((acc, speaker) => {
        acc[speaker.uid] = speaker
        return acc
    }, {})
    const categories = fileContents.categories
    const categoriesById = categories.reduce((acc, curr) => {
        acc[curr.id] = curr
        return acc
    }, {})
    const formats = fileContents.formats
    const formatsById = formats.reduce((acc, curr) => {
        acc[curr.id] = curr
        return acc
    }, {})

    const totalSubmittedTalks = proposals.length
    const totalSpeakers = Object.keys(speakersById).length


    console.log("------- SPEAKERS --------")

    console.log("Total submitted talks:", totalSubmittedTalks)
    console.log("Total uniq speakers:", totalSpeakers)
    console.log("Number of speakers having submitted multiple talks:", speakers.length - totalSpeakers)

    console.log("------- TALKS --------")

    console.log("Total talks:", proposals.length)
    const talksByFormats = proposals.reduce((acc, curr) => {
        const format = formatsById[curr.formats]
        if (!acc[format.id]) {
            acc[format.id] = {
                format: format.name,
                count: 0
            }
        }
        acc[format.id].count++
        return acc
    }, {})
    console.log("Talks by format:", Object.values(talksByFormats))
    const talksByCategories = proposals.reduce((acc, curr) => {
        const category = categoriesById[curr.categories]
        if (!acc[category.id]) {
            acc[category.id] = {
                category: category.name,
                count: 0
            }
        }
        acc[category.id].count++
        return acc
    }, {})
    console.log("Talks by category:", Object.values(talksByCategories))


    const talkRatingBase = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5]
    const talkByRatings = proposals.reduce((acc, curr) => {
        const rating = Math.round(curr.rating * 10) / 10
        acc[rating].count++
        return acc
    }, talkRatingBase.reduce((acc, curr) => {
        acc[curr] = {
            rating: curr,
            count: 0
        }
        return acc
    }, {}))
    console.log("Talks by rating: \n", Object.values(talkByRatings).map( value => `${value.rating}, ${value.count}`))


    console.log("------- ACCEPTED/CONFIRMED --------")

    const acceptedOrConfirmedTalks = proposals.filter(proposal => proposal.state === 'accepted' || proposal.state === 'confirmed')
    const acceptedOrConfirmedTalksBySpeaker = acceptedOrConfirmedTalks.reduce((acc, proposal) => {
        const speakers = Object.keys(proposal.speakers).map(speaker => speakersById[speaker])
        speakers.forEach(speaker => {
            if (!acc[speaker.uid]) {
                acc[speaker.uid] = {
                    speaker: speaker.name,
                    count: 0
                }
            }
            acc[speaker.uid].count++
        })
        return acc
    }, {})
    console.log(`Total accepted or confirmed talks: ${acceptedOrConfirmedTalks.length}`)
    console.log("Number of accepted or confirmed speakers:", Object.keys(acceptedOrConfirmedTalksBySpeaker).length)

    const numberOfAcceptedOrConfirmedTalkPerFormat = acceptedOrConfirmedTalks.reduce((acc, proposal) => {
        const format = formatsById[proposal.formats]
        if (!acc[format.id]) {
            acc[format.id] = {
                format: format.name,
                count: 0
            }
        }
        acc[format.id].count++
        return acc
    }, {})
    console.log("Number of accepted or confirmed talks per format:", Object.values(numberOfAcceptedOrConfirmedTalkPerFormat))
    const numberOfAcceptedOrConfirmedTalkPerCategories = acceptedOrConfirmedTalks.reduce((acc, proposal) => {
        const category = categoriesById[proposal.categories]
        if (!acc[category.id]) {
            acc[category.id] = {
                category: category.name,
                count: 0
            }
        }
        acc[category.id].count++
        return acc
    }, {})
    console.log("Number of accepted or confirmed talks per category:", Object.values(numberOfAcceptedOrConfirmedTalkPerCategories))




}

program
    .option('-d, --debug', 'debug mode')


main()
