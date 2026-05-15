const bs58 = require('bs58').default;
const fs = require('fs');

const privateKey = '2eZ9Law5mNkp4Aq5fU7xZNRujgKTyGcrAnCcsGRqjv8Zy5ngLvk2pt1oQawgfu6Mq1nD5kCUYrdXADHrYgSz7ToV';

const secretKey = bs58.decode(privateKey);

fs.writeFileSync(
  'phantom.json',
  JSON.stringify(Array.from(secretKey))
);

console.log('Saved phantom.json');