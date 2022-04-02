const {program} = require('commander')
const FireStoreParser = require('firestore-parser')
const fetch = require('node-fetch')
const ora = require('ora')
const fs = require('fs').promises
require('dotenv').config()

const key = process.env.apiKey
const projectID = process.env.projectID
let userIdToken = undefined

const fetchFirestore = (path, pageSize = 1, nextPageToken) => {
    let url = `https://firestore.googleapis.com/v1beta1/projects/${projectID}/databases/(default)/documents/${path}?key=${key}&pageSize=${pageSize}`
    if(nextPageToken) {
        url += `&pageToken=${nextPageToken}`
    }
    return fetch(url,
        {
            headers: {
                "Authorization": `Bearer ${userIdToken}`
            }
        })
        .then(response => response.json())
        .then(json => FireStoreParser(json))
        .then(response => {
            if (response.error) {
                console.error(response.error)
                throw "Error! (see msg above this)"
                process.exit(1)
            }
            return response
        })
}

const fetchDocument = (path, pageSize = 1) => {
    return fetchFirestore(path, pageSize)
        .then(response => response.fields)
}

const getEvent = async (eventId) => {
    const response = await fetchDocument(`events/${eventId}`)
    return response
}

const getUsers = async (organizationId) => {
    const response = await  fetchDocument(`organizations/${organizationId}/`)

    const organization = response
    const userIds = Object.keys(organization.members)

    const users = {}

    for(const userId of userIds) {
        const user = await fetchDocument(`users/${userId}`)
        users[userId] = user
    }

    return users
}

const getProposals = async (eventId, pageSize) => {
    let response = await  fetchFirestore(`events/${eventId}/proposals/`, pageSize)

    let proposals = response.documents.map(doc => doc.fields)

    do {
        response = await  fetchFirestore(`events/${eventId}/proposals/`, pageSize, response.nextPageToken)
        proposals = proposals.concat(response.documents.map(doc => doc.fields))

        if(program.debug) console.log(`Proposal count: ${proposals.length}`)
    } while (response.nextPageToken)

    return proposals
}

const getSpeakers = async (proposals) => {
    const speakerIds = proposals.flatMap(prop => Object.keys(prop.speakers))
    const users = []

    for(const userId of speakerIds) {
        users.push(await fetchDocument(`users/${userId}`))
    }

    return users
}

const hydrateRatingsOnProposals = async (eventId, proposals) => {
    const updatedProposals = JSON.parse(JSON.stringify(proposals))

    for(const proposal of updatedProposals) {
        if(program.debug) console.log(`Fetch proposal on: ${proposal.id}`)

        const response = await  fetchFirestore(`events/${eventId}/proposals/${proposal.id}/ratings`, 100)

        if(response.nextPageToken) {
            console.log(">> Not all ratings fetched /!\\")
        }

        proposal.ratings = response.documents.map(doc => doc.fields)
    }

    return updatedProposals
}

const calculateVoteByCategoriesByUser = (proposals, users, categories) => {
    const categoriesById = categories.reduce((acc, cat ) => {
        acc[cat.id] = cat.name

        return acc
    }, {})

    const ratingsByCategorie = proposals.reduce((acc, prop) => {
        const key = categoriesById[prop.categories]
        if(!acc[key]) {
            acc[key] = []
        }

        acc[key] = acc[key].concat(prop.ratings.map(rating => ({
            ...rating,
            proposalId: prop.id
        })))

        return acc
    }, {})

    return Object.keys(users).map(userId => {
        return {
            ...users[userId],
            formats: Object.keys(ratingsByCategorie).map(categorieName => {
                const ratings = ratingsByCategorie[categorieName]
                return {
                    [categorieName]: ratings.filter(rating => rating.uid === userId).map(rating => {
                        if(rating.feeling === "neutral") {
                            return `${rating.rating} (${rating.proposalId})`
                        }
                        return `${rating.feeling} (${rating.proposalId})`
                    })
                }
            })
        }
    })
}

const getVotesByFormatByUser = async (eventId, pageSize) => {
    const spinner = ora("Loading event")

    const event = await getEvent(eventId)

    const categories = event.categories

    spinner.start("Loading users")
    const users = await getUsers(event.organization)

    spinner.text = 'Loading proposals'
    const proposals = await getProposals(eventId, pageSize)

    spinner.text = 'Loading ratings'
    const updatedProposals = await hydrateRatingsOnProposals(eventId, proposals)

    spinner.succeed("Loading completed!")

    console.log('Merging datas...')
    return calculateVoteByCategoriesByUser(updatedProposals, users, categories)
}

const exportSpeakersAndProposals = async (eventId, pageSize, filterStatus) => {
    const spinner = ora().start("Loading proposals")
    const proposals = await getProposals(eventId, pageSize)

    let filteredProposal = proposals
    if(filterStatus) {
        const filters = filterStatus.split(',')
        filteredProposal = proposals.filter(prop => filters.includes(prop.state))
        console.log(` -- ${filteredProposal.length} filtered proposals out of ${proposals.length}`)
    }

    spinner.text = 'Loading speakers'
    const speakers = await getSpeakers(filteredProposal)

    console.log(` -- ${speakers.length} speakers retrieved`)

    spinner.succeed("Loading completed!")

    return [speakers, filteredProposal]
}

const exportSpeakersEmails = async (eventId, pageSize, filterStatus) => {
    const [speakers] = await exportSpeakersAndProposals(eventId, pageSize, filterStatus)

    return speakers.map(speaker => speaker.email).join(',')
}

const writeResult = (fileName, data) => {
    return fs.writeFile(fileName,data)
}

const main = async () => {
    program.parse(process.argv)

    if (program.debug) {
        console.log(program.opts())
    }

    if (!program.eventId) {
        console.log("Missing event id (use -e myId)")
        process.exit(1)
    }

    if (!program.exportUserFormatsVotes && !program.exportSpeakers && !program.exportConfirmedTalks) {
        console.log("No export chosen")
        process.exit(1)
    }

    if (!program.token) {
        console.log("No ID Token")
        process.exit(1)
    }

    const eventId = program.eventId
    const pageSize = program.size
    userIdToken = program.token

    if(program.exportUserFormatsVotes) {
        const result = await getVotesByFormatByUser(eventId, pageSize)
        const spinner = ora("Saving file")
        const fileName = "votesByFormatByUsers.json"
        await writeResult(fileName, JSON.stringify(result))
        spinner.succeed(`File saved to ./${fileName}`)
    }

    if(program.exportSpeakers) {
        const resultSpeakerEmails = await exportSpeakersEmails(eventId, pageSize, program.filterTalkState)
        const spinner = ora("Saving file")
        const fileName = "speakers.csv"
        await writeResult(fileName, resultSpeakerEmails)
        spinner.succeed(`File saved to ./${fileName}`)
    }

    if(program.exportConfirmedTalks) {
        const [speakers, proposals] = await exportSpeakersAndProposals(eventId, pageSize, "confirmed")
        const event = await getEvent(eventId)
        const categories = event.categories
        const spinner = ora("Saving file")
        const fileName = "speakersAndProposals.json"
        await writeResult(fileName, JSON.stringify({categories, speakers, proposals}, 0, 4))
        spinner.succeed(`File saved to ./${fileName}`)
    }
}

program
    .option('--export-user-formats-votes', 'get number of votes by user by talk formats')
    .option('--export-speakers', 'export speakers email, in .csv')
    .option('--export-confirmed-talks', 'export the confirmed talks, their speakers and their categories in .json')
    .option('--filter-talk-state <talkStatus>', 'the talk state to keep like accepted,confirmed,submitted')
    .option('-d, --debug', 'debug mode')
    .option('-s, --size <pageSize>', 'the number of proposal to fetch by page', 50)
    .option('-t, --token <idToken>', 'Your ID Token (find it on conference-hall.io from the request body going to www.googleapis.com')
    .option('-e, --event-id <id>', 'conference-hall.io event id')


main()
