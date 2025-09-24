const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

// --- Configuration ---
const app = express();
app.use(cors());
app.use(express.json());

// Set EJS as the templating engine
app.set('view engine', 'ejs');
// Tell Express where to find the .ejs files
app.set('views', path.join(__dirname, 'views'));

// --- Azure SQL configuration ---
// For security, it's best to move these to a .env file in a real project
const dbConfig = {
    user: 'admin_wastemg',
    password: 'Nitte@hack',
    server: 'wastemgmt-sqlserver.database.windows.net',
    database: 'wastemgDB',
    options: {
        encrypt: true, // for Azure
        enableArithAbort: true
    }
};

// --- Routes ---

// Route to serve the scanner web page
app.get('/scanner', (req, res) => {
    // This will find and render scanner.ejs from the 'views' folder
    res.render('scanner');
});

// API route to update collection status
app.get('/collect', async (req, res) => {
    const houseId = req.query.houseid;

    if (!houseId) {
        return res.status(400).send("Household ID is required.");
    }

    let pool;
    try {
        // Connect to Azure SQL
        pool = await sql.connect(dbConfig);

        // Check if a log entry for today already exists
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

        const existingLog = await pool.request()
            .input('HouseholdID', sql.VarChar, houseId)
            .input('Today', sql.Date, today)
            .query(`SELECT LogID, Status FROM CollectionLogs WHERE HouseholdID = @HouseholdID AND CONVERT(date, CollectedOn) = @Today`);

        if (existingLog.recordset.length > 0) {
            // Entry exists, check status
            const currentStatus = existingLog.recordset[0].Status;
            if (currentStatus === 'collected') {
                return res.status(200).send(`Household ${houseId} already marked as collected today.`);
            } else {
                 // Entry exists but is 'pending', so update it
                const result = await pool.request()
                    .input('HouseholdID', sql.VarChar, houseId)
                    .input('Today', sql.Date, today)
                    .query(`UPDATE CollectionLogs SET Status = 'collected', CollectedOn = GETUTCDATE() WHERE HouseholdID = @HouseholdID AND CONVERT(date, CollectedOn) = @Today`);
                
                if (result.rowsAffected[0] === 0) {
                    return res.status(404).send(`Household ${houseId} not found for today.`);
                }
                res.status(200).send(`Household ${houseId} status updated to 'collected'!`);
            }
        } else {
            // No entry for today, so create a new one. (This part is optional, depending on your logic)
            // For now, let's assume entries are pre-created and we only update them.
            return res.status(404).send(`No collection log found for Household ${houseId} for today.`);
        }
    } catch (err) {
        console.error("DATABASE ERROR:", err);
        res.status(500).send('Error connecting to or updating the database.');
    } finally {
        if (pool) {
            pool.close();
        }
    }
});



// Function to add daily pending logs
async function addDailyPendingLogs() {
  try {
    const pool = await sql.connect(dbConfig);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    await pool.request()
      .input("today", sql.NVarChar, today)
      .query(`
        INSERT INTO CollectionLogs (HouseholdID, CollectedOn, Status)
        SELECT h.HouseholdID, GETDATE(), 'Pending'
        FROM Households h
        WHERE NOT EXISTS (
          SELECT 1 
          FROM CollectionLogs c
          WHERE c.HouseholdID = h.HouseholdID
            AND CAST(c.CollectedOn AS DATE) = @today
        )
      `);

    console.log("✅ Daily Pending Logs added for today:", today);
    await pool.close();
  } catch (err) {
    console.error("❌ Error adding daily pending logs:", err);
  }
}

// Function to reset today's collected logs back to pending
async function resetTodayCollectedLogs() {
  try {
    const pool = await sql.connect(dbConfig);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const result = await pool.request()
      .input("today", sql.NVarChar, today)
      .query(`
        UPDATE CollectionLogs
        SET Status = 'pending'
        WHERE Status = 'collected'
          AND CAST(CollectedOn AS DATE) = @today
      `);

    console.log(
      `✅ Reset 'collected' → 'pending' for today (${today}). Rows affected: ${result.rowsAffected[0]}`
    );

    await pool.close();
  } catch (err) {
    console.error("❌ Error resetting today's collected logs:", err);
  }
}


// should print your server
async function startServer() {
  try {
    console.log(process.env.AZURE_DB_SERVER); 
    const pool = await sql.connect(dbConfig);
    console.log('✅ Connected to Azure SQL!');

    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get('/api/households', (req, res) => {
      res.json(data.households);
    });

    const PORT = 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    await addDailyPendingLogs();
  } catch (err) {
    console.error('❌ Azure SQL connection failed:', err);
  }
}

startServer();
