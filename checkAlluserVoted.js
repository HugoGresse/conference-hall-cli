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

//checkVoteCount("votesByFormatByUsers.json")
checkLoveAndFive("votesByFormatByUsers.json")
