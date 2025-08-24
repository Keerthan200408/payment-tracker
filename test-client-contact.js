const { MongoClient } = require('mongodb');

// Test script to check client contact info in database
async function testClientContactInfo() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('payment_tracker');
    
    // Get all client collections (they follow pattern clients_username)
    const collections = await db.listCollections().toArray();
    const clientCollections = collections.filter(col => col.name.startsWith('clients_'));
    
    console.log('Found client collections:', clientCollections.map(c => c.name));
    
    for (const collection of clientCollections) {
      console.log(`\n--- Checking ${collection.name} ---`);
      
      const clients = await db.collection(collection.name).find({}).toArray();
      console.log(`Total clients: ${clients.length}`);
      
      clients.forEach((client, index) => {
        console.log(`Client ${index + 1}:`);
        console.log(`  Name: ${client.Client_Name}`);
        console.log(`  Email: "${client.Email}" (length: ${client.Email?.length || 0})`);
        console.log(`  Phone: "${client.Phone_Number}" (length: ${client.Phone_Number?.length || 0})`);
        console.log(`  Type: ${client.Type}`);
        console.log(`  Has Email: ${!!client.Email && client.Email.trim() !== ''}`);
        console.log(`  Has Phone: ${!!client.Phone_Number && client.Phone_Number.trim() !== ''}`);
        console.log('---');
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

// Run the test
testClientContactInfo().catch(console.error);
