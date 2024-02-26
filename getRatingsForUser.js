const fs = require('fs').promises



const getRatingForUser = async (fileName, userId, ratingValue, feeling = null) => {
    const rawFileContent = await fs.readFile(fileName);
    const fileContent = JSON.parse(rawFileContent)

    const proposals = fileContent.updatedProposals

    console.log("Total proposals count: ", proposals.length)

    const filteredProposals = proposals.filter(prop => {
        if(prop.ratings.find(rating => (rating.uid === userId) && (rating.rating === ratingValue) && (feeling && rating.feeling === feeling))) {
            return true
        }
        return false
    })

    console.log(`Filtered proposals with rating at ${ratingValue}: ${filteredProposals.length}`)

    console.log(filteredProposals.map(prop => prop.title + '').slice(0,50))
    console.log(filteredProposals.map(prop => prop.title + '').slice(50))

}


getRatingForUser("proposalsFull.json", "", "5", "love")