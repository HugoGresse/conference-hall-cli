# Conference-hall-cli
Some tools for Conference-Hall.io using the Firestore REST API

### Setup

1. Create a `.env` from `.env.example` and complete your Firebase IDs
2. Get your ID Token (find it on conference-hall.io from the request body going to www.googleapis.com'
3. `npm i`

#### Export ratings by Categories by User
Useful to know if someone rated with too much ❤️ or not enough "5" for example. 

```
node index.js -e [EVENT_ID] --export-user-formats-votes -t [A_VERY_LONG_TOKEN]
```

Outputs:
```json

  {
    "uid": "azertyuiopqsdfghjkl",
    "photoURL": "https://example.com/photo.jpg",
    "createTimestamp": "2018-11-19T13:09:55.935Z",
    "updateTimestamp": "2020-01-08T20:28:52.152Z",
    "displayName": "John To",
    "betaAccess": "sssssxxxx",
    "email": "example@gmail.com",
    "formats": [
      {U
        "Cloud & Devops": [
          "noopinion (2nUoRfU9qblCBji2OHWx)",
          "3 (3WtnMK7lCEOWPYbOFEeY)",
          "noopinion (4UnOEnXQwc2rM2gIOgjU)",
          "noopinion (6UJUPPZIwvWdsYXyqIzZ)",
          "3 (6c0Gvj2vjiuaovgUtoqO)"
        ]
      },
      {
        "Data": [
          "1 (2ES6o3qTL7eEJ6K6RTbG)",
          "2 (3ducAoiPCcVqxmv8rXCN)",
          "5 (3g2luwuh2e5to9b2zIF3)",
          "2 (69zborLgYb0HRil9ogoU)",
          "love (IXdCLw8DYMDL31eIl6S9)"
        ]
      }
    ]
  }
```
#### Export speakers
Export speakers in .csv

```
node index.js -e [EVENT_ID] --export-speakers --filter-talk-state confirmed,accepted -t [A_VERY_LONG_TOKEN]
```
#### Aggregate some stats

To be run after the `voteByFormatByUsers.json` has been exported using the cli. 
See `checkAlluserVoted.js` which include three functions: 

- `checkTalkRatings(proposalId)` which output the rating on the proposal and the average
- `checkVoteCount("votesByFormatByUsers.json")` which output the number of votes by format for each user and save it to `votesByUserByFormatByType.json`
- `checkLoveAndFive("votesByFormatByUsers.json")` which output the number of love and five for each user.
