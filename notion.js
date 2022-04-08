const { program } = require('commander')
const ora = require('ora')
const fs = require('fs').promises
const { Client } = require("@notionhq/client")
require('dotenv').config()

const notion = new Client({
    auth: process.env.notionToken,
})

const fileName = './speakersAndProposals.json'

const notionFormatToFlatObject = (pagesData) => {
    if (pagesData.length === 0) return []
    const keys = Object.keys(pagesData[0].properties)
    return pagesData.map(data => {
        return keys.reduce((acc, key) => {
            const property = data.properties[key]

            switch (property.type) {
                case "title":
                    acc[key] = property.title[0]?.plain_text
                    break
                case "rich_text":
                    acc[key] = property.rich_text[0]?.plain_text
                    break
                case "relation":
                    acc[key] = property.relation?.map(relation => relation.id)
                    break
                case "date":
                    if (property.date) acc[key] = property.date.start
                    break
                case "checkbox":
                    acc[key] = property.checkbox
                    break
                default:
                    console.log("unknown", property)
                    break
            }
            return acc
        }, {
            id: data.id,
        })
    })
}
const SPEAKERS_KEYS = ['name', 'bio', 'photoURL', 'company', "phone", 'cid', 'twitter', 'github', 'linkedin', 'email']
const PROPOSALS_KEYS = ['title', 'categories', "speakers", 'level', "formats", "date", 'cid']
const flatObjectToNotionFormat = (data, keysToUse) => {
    const keys = Object.keys(data)
    return {
        properties: keys.reduce((acc, key) => {
            if (keysToUse.includes(key)) {
                if (key === keysToUse[0]) {
                    acc[key] = {
                        title: [{
                            text: {
                                content: data[key]
                            }
                        }]
                    }
                } else if (["speakers"].includes(key)) {
                    acc[key] = {
                        type: "relation",
                        relation: data[key].map(speakerId => {
                            return {
                                id: speakerId
                            }
                        })
                    }
                } else if (key === "date") {
                    acc[key] = {
                        type: "date",
                        date: {
                            start: data[key],
                            end: data["dateEnd"],
                        }
                    }
                } else {
                    acc[key] = {
                        rich_text: [{
                            text: {
                                content: data[key] || ""
                            }
                        }]
                    }
                }
            }
            return acc
        }, {}),
    }
}

const getNotionPagesData = async (databaseIds) => {
    const pagesIds = await getNotionPagesIds(databaseIds)
    return await Promise.all(pagesIds.map(async (pageId) => {
        return await notion.pages.retrieve({ page_id: pageId })
    }))
}

const getNotionPagesIds = async (database, totalPagesIds = []) => {
    const response = await notion.databases.query({
        database_id: database,
    })
    const ids = [...totalPagesIds, ...response.results.map(page => page.id)]
    if (response.has_more) {
        return getNotionPagesIds(database, ids)
    }
    return ids
}

const archiveNotionPage = async (pageId) => {
    return await notion.pages.update({
        page_id: pageId,
        archived: true
    })
}
const addNotionPage = async (dbId, data, keys) => {
    await notion.pages.create({
        parent: {
            database_id: dbId,
        },
        ...flatObjectToNotionFormat(data, keys)
    })
}

const getSocialHandle = (social) => {
    if (!social) return null
    if (social.includes("@") || !social.startsWith("http")) return social.replace('@', '')

    return social.split('/').pop()
}


// CID = conference hall id
const archiveOn = false
const dryRun = false
const syncToNotion = async (speakerDBId, proposalsDBId) => {
    let spinner = ora().start("Loading file")
    const rawFileContent = await fs.readFile(fileName)
    const fileContent = JSON.parse(rawFileContent)

    const categoriesById = fileContent.categories.reduce((acc, category) => {
        acc[category.id] = category.name
        return acc
    }, {})
    const formatsById = fileContent.formats.reduce((acc, format) => {
        acc[format.id] = format.name
        return acc
    }, {})
    const speakers = fileContent.speakers.map(speaker => {
        speaker.cid = speaker.uid
        speaker.name = speaker.displayName
        return speaker
    })
    const proposals = fileContent.proposals.map(proposal => {
        proposal.cid = proposal.id
        return proposal
    })
    const speakerIds = speakers.map(speaker => speaker.uid)
    const proposalIds = proposals.map(proposal => proposal.id)

    spinner.text = 'Getting data from notion, speakers'
    const nSpeakers = notionFormatToFlatObject(await getNotionPagesData(speakerDBId))
    spinner.text = 'Getting data from notion, talks'
    const nProposals = notionFormatToFlatObject(await getNotionPagesData(proposalsDBId))
    spinner.succeed("Getting data from notion")

    // 1. Remove speaker on notion not present here
    spinner = ora().start('Updating notion speakers')
    if (archiveOn) {
        const speakersToRemove = nSpeakers.filter(speaker => !speakerIds.includes(speaker.cid) && !speaker.manual)
        if (dryRun) {
            console.log("Speakers to remove: ", speakersToRemove.length)
        } else {
            await Promise.all(speakersToRemove.map(speaker => archiveNotionPage(speaker.id)))
        }
    }

    // 2. Add speaker not present here
    const speakersToAdd = speakers.filter(speaker => !nSpeakers.find(nSpeaker => nSpeaker.cid === speaker.uid))
    if (dryRun) {
        console.log("Speakers to add: ", speakersToAdd.length)
    } else {
        await Promise.all(speakersToAdd.map(speaker => addNotionPage(speakerDBId, speaker, SPEAKERS_KEYS)))

    }
    spinner.succeed("Updating notion speakers")

    // 3. Remove talks on notion not present here
    spinner = ora().start('Updating notion talks')
    if (archiveOn) {
        const talksToRemove = nProposals.filter(proposal => !proposalIds.includes(proposal.cid) && !proposal.manual)
        if (dryRun) {
            console.log("Talks to remove: ", talksToRemove.length)
        } else {
            await Promise.all(talksToRemove.map(proposal => archiveNotionPage(proposal.id)))

        }
    }

    // 4. Add talks not present here
    const updatedSpeakers = notionFormatToFlatObject(await getNotionPagesData(speakerDBId))
    const notionSpeakersByCID = updatedSpeakers.reduce((acc, speaker) => {
        acc[speaker.cid] = speaker
        return acc
    }, {})
    const talksToAdd = proposals.filter(proposal => !nProposals.find(nProposal => nProposal.cid === proposal.id))
    if(dryRun) {
        console.log("Talks to add: ", talksToAdd.length)
    } else {
        const talksToAddWithSpeakers = talksToAdd.map(proposal => {
            proposal.speakers = Object.keys(proposal.speakers).map(speakerId => notionSpeakersByCID[speakerId].id)
            proposal.categories = categoriesById[proposal.categories]
            proposal.formats = formatsById[proposal.formats]
            proposal.date = "2022-06-30T00:10:00+00:00"
            proposal.dateEnd = "2022-06-30T00:11:00+00:00"
            return proposal
        })
        await Promise.all(talksToAddWithSpeakers.map(proposal => addNotionPage(proposalsDBId, proposal, PROPOSALS_KEYS)))
    }

    spinner.succeed("Updating notion talks")
}

const syncFromNotion = async (speakerDBId, proposalsDBId) => {
    let spinner = ora().start("Loading file")
    const rawFileContent = await fs.readFile(fileName)
    const fileContent = JSON.parse(rawFileContent)

    const speakersById = fileContent.speakers.reduce((acc, speaker) => {
        acc[speaker.uid] = speaker
        return acc
    }, {})
    const proposalsById = fileContent.proposals.reduce((acc, proposal) => {
        acc[proposal.id] = proposal
        return acc
    }, {})
    spinner.text = 'Getting data from notion, speakers'
    const nSpeakers = notionFormatToFlatObject(await getNotionPagesData(speakerDBId))
    const nSpeakersById = nSpeakers.reduce((acc, speaker) => {
        acc[speaker.id] = speaker
        return acc
    }, {})
    spinner.text = 'Getting data from notion, talks'
    const nTalks = notionFormatToFlatObject(await getNotionPagesData(proposalsDBId))

    spinner.succeed("Getting data from notion")

    // 1. Remove speaker on notion not present here
    spinner = ora().start('Formatting output data')

    const outputSpeakers = nSpeakers.reduce((acc, notionSpeaker) => {
        const twitter = getSocialHandle(notionSpeaker.twitter)
        const github = getSocialHandle(notionSpeaker.github)

        const socials = []
        if (twitter) {
            socials.push({
                name: 'Twitter',
                icon: "twitter",
                url: `https://twitter.com/${twitter}`
            })
        }
        if (github) {
            socials.push({
                name: 'Github',
                icon: "github",
                url: `https://github.com/${github}`
            })
        }

        acc[notionSpeaker.cid] = {
            bio: notionSpeaker.bio,
            company: notionSpeaker.company,
            companyLogoUrl: notionSpeaker.companyLogoUrl,
            country: speakersById[notionSpeaker.cid]?.city,
            name: notionSpeaker.name,
            photoUrl: notionSpeaker.photoURL,
            socials: socials,
            shortBio: notionSpeaker.shortBio,
            title: notionSpeaker.title,
        }

        return acc
    }, {})

    const outputSessions = nTalks.reduce((acc, talk, index) => {
        acc[talk.cid || talk.id] = {
            title: talk.title,
            complexity: talk.level,
            description: proposalsById[talk.cid]?.description,
            language: "French",
            tags: talk.categories ? [talk.categories] : [],
            speakers: talk.speakers.map(speakerId => nSpeakersById[speakerId].cid),
            presentation: null,
            videoId: null,
            image: talk.image || null,
            hideInFeedback: talk.hideInFeedback,
            hideTrackTitle: talk.hideTrackTitle,
        }

        return acc
    }, {})

    spinner.succeed("Formatting output data")

    await fs.writeFile("hoverboardSpeakerSessionsSchedule.json", JSON.stringify({
        speakers: outputSpeakers,
        sessions: outputSessions,
        schedule: {}
    }, 0, 4))
}

const main = async () => {
    program.parse(process.argv)

    const speakerDatabaseId = "bf3bb15df392471293d9d293bde6cd34"
    const proposalDatabaseId = "9201cbe052eb42cbbb9d20674ade9ece"

    if (!program.syncToNotion && !program.syncFromNotion) {
        console.log("No export chosen")
        process.exit(1)
    }

    if (program.syncToNotion) {
        await syncToNotion(speakerDatabaseId, proposalDatabaseId)
    }

    if (program.syncFromNotion) {
        await syncFromNotion(speakerDatabaseId, proposalDatabaseId)
    }
}


program
    .option('--sync-to-notion', 'from speakersAndProposals.json file, update the data on Notion.so and may delete unused speakers & talks')
    .option('--sync-from-notion', 'from Notion.so, reconstruct the schedule and speakers for Hoverboard websites')


main()
