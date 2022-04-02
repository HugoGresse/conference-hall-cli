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
            }
            return acc
        }, {
            id: data.id,
        })
    })
}
const SPEAKERS_KEYS = ['name', 'bio', 'photoURL', 'company', "phone", 'cid', 'twitter', 'github', 'linkedin', 'email']
const PROPOSALS_KEYS = ['title', 'categories', "speakers", 'level', 'cid']
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

// CID = conference hall id
const archiveOn = false
const syncToNotion = async (speakerDBId, proposalsDBId, tracksDBId) => {
    let spinner = ora().start("Loading file")
    const rawFileContent = await fs.readFile(fileName)
    const fileContent = JSON.parse(rawFileContent)

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
        const speakersToRemove = nSpeakers.filter(speaker => !speakerIds.includes(speaker.cid))
        await Promise.all(speakersToRemove.map(speaker => archiveNotionPage(speaker.id)))
    }

    // 2. Add speaker not present here
    const speakersToAdd = speakers.filter(speaker => !nSpeakers.find(nSpeaker => nSpeaker.cid === speaker.uid))
    await Promise.all(speakersToAdd.map(speaker => addNotionPage(speakerDBId, speaker, SPEAKERS_KEYS)))
    spinner.succeed("Updating notion speakers")

    // 3. Remove talks on notion not present here
    spinner = ora().start('Updating notion talks')
    if (archiveOn) {
        const talksToRemove = nProposals.filter(proposal => !proposalIds.includes(proposal.cid))
        await Promise.all(talksToRemove.map(proposal => archiveNotionPage(proposal.id)))
    }

    // 4. Add talks not present here
    const updatedSpeakers = notionFormatToFlatObject(await getNotionPagesData(speakerDBId))
    const notionSpeakersByCID = updatedSpeakers.reduce((acc, speaker) => {
        acc[speaker.cid] = speaker
        return acc
    }, {})
    const talksToAdd = proposals.filter(proposal => !nProposals.find(nProposal => nProposal.cid === proposal.id))
    const talksToAddWithSpeakers = talksToAdd.map(proposal => {
        proposal.speakers = Object.keys(proposal.speakers).map(speakerId => notionSpeakersByCID[speakerId].id)
        return proposal
    })
    await Promise.all(talksToAddWithSpeakers.map(proposal => addNotionPage(proposalsDBId, proposal, PROPOSALS_KEYS)))

    spinner.succeed("Updating notion talks")
}

const main = async () => {
    program.parse(process.argv)

    const speakerDatabaseId = "bf3bb15df392471293d9d293bde6cd34"
    const proposalDatabaseId = "9201cbe052eb42cbbb9d20674ade9ece"
    const tracksDatabaseId = "1ee05d974cb047d7902f8818edea6188"

    if (!program.syncToNotion) {
        console.log("No export chosen")
        process.exit(1)
    }

    if (program.syncToNotion) {
        await syncToNotion(speakerDatabaseId, proposalDatabaseId, tracksDatabaseId)
    }
}


program
    .option('--sync-to-notion', 'TODO')


main()
