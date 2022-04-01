const fs = require('fs').promises


const checkVoteCount = async (fileName) => {
    const rawFileContent = await fs.readFile(fileName);
    const fileContent = JSON.parse(rawFileContent)

    const results = fileContent.map(user => {
        return {
            name: user.displayName,
            ratingByFormats: user.formats.map(format =>{
                const key = Object.keys(format)[0]

                return format[key].length
            })
        }
    }).map(user => {
        return {
            ...user,
            ratingCount: user.ratingByFormats.reduce((acc, item) => {
                return acc + item
            }, 0)
        }
    }).filter(user => user.ratingCount > 0)

    console.log(results)
}

const checkLoveAndFive = async (fileName) => {
    const rawFileContent = await fs.readFile(fileName);
    const fileContent = JSON.parse(rawFileContent)

    const results = fileContent.map(user => {
        return {
            name: user.displayName,
            ratingByFormats: user.formats.map(format =>{
                const key = Object.keys(format)[0]

                return {
                    [key]: format[key].reduce((acc, item ) => {
                        const cleanedItem = item.split(' ')[0]

                        if(cleanedItem < 5 && cleanedItem !== 'love'){
                            return acc
                        }

                        if(!acc[cleanedItem]){
                            acc[cleanedItem] = 0
                        }

                        acc[cleanedItem] += 1


                        return acc
                    }, {})
                }
            })
        }
    })

    fs.writeFile("votesByUserByFormatByType.json", JSON.stringify(results))
}

const checkTalkRatings = async (talkId) => {
    const rawFileContent = await fs.readFile("votesByFormatByUsers.json");
    const fileContent = JSON.parse(rawFileContent)

    const ratings = fileContent.flatMap(user =>
        user.formats.flatMap(format => {

            const talkFound = Object.values(format)[0].find(talkWithRating => talkWithRating.includes(talkId))

            return talkFound
        }
    ))
        .filter(value => value !== undefined)
        .map(value => Number.parseInt(value.split(' ')[0]))
    const sum = ratings.reduce((acc, item) => {
        return acc + item
    }, 0)
    console.log(ratings, sum / ratings.length)
}

// checkTalkRatings("Kwm73yhIAEwizxpwiBpw")
// checkVoteCount("votesByFormatByUsers.json")
// checkLoveAndFive("votesByFormatByUsers.json")
