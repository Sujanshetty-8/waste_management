const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

// --- Configuration ---
const app = express();
app.use(cors());
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Azure SQL configuration ---
const dbConfig = {
    user: 'admin_wastemg',
    password: 'Nitte@hack',
    server: 'wastemgmt-sqlserver.database.windows.net',
    database: 'wastemgDB',
    options: {
        encrypt: true,
        enableArithAbort: true,
        connectionTimeout: 30000 
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// --- Global Database Connection Pool ---
let pool;

// --- Routes ---
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1>Waste Collection Server is Running</h1>
            <p>Click the link below to access the scanner.</p>
            <a href="/scanner" style="font-size: 1.2em; padding: 10px 20px; background-color: #1877f2; color: white; text-decoration: none; border-radius: 5px;">
                Go to Scanner
            </a>
        </div>
    `);
});

app.get('/scanner', (req, res) => {
    res.render('scanner');
});

// --- API Route to update collection status ---
app.get('/collect', async (req, res) => {
    const houseId = req.query.houseid;

    if (!houseId) {
        return res.status(400).json({ success: false, message: "Household ID is required." });
    }

    try {
        const now = new Date();
        const istDate = new Date(now.getTime() + (330 * 60 * 1000));
        const today_ist = istDate.toISOString().slice(0, 10);

        // First, try to update a 'pending' log to 'collected'.
        const updateQuery = `
            UPDATE CollectionLogs 
            SET Status = 'collected', CollectorName = 'WebApp Scanner', CollectedOn = GETUTCDATE() 
            WHERE HouseholdID = @HouseholdID 
              AND CONVERT(date, CollectedOn AT TIME ZONE 'UTC' AT TIME ZONE 'India Standard Time') = @Today
              AND Status = 'pending'
        `;
        const updateResult = await pool.request()
            .input('HouseholdID', sql.VarChar, houseId)
            .input('Today', sql.Date, today_ist)
            .query(updateQuery);

        if (updateResult.rowsAffected[0] > 0) {
            // SUCCESS: The update worked perfectly.
            return res.status(200).json({ success: true, message: `Household ${houseId} status updated to 'collected'.` });
        } else {
            // The update failed. Let's find out why.
            // Check the current status of the log for today.
            const checkQuery = `
                SELECT Status FROM CollectionLogs
                WHERE HouseholdID = @HouseholdID
                AND CONVERT(date, CollectedOn AT TIME ZONE 'UTC' AT TIME ZONE 'India Standard Time') = @Today
            `;
            const checkResult = await pool.request()
                .input('HouseholdID', sql.VarChar, houseId)
                .input('Today', sql.Date, today_ist)
                .query(checkQuery);

            if (checkResult.recordset.length > 0 && checkResult.recordset[0].Status === 'collected') {
                // A log exists and is already 'collected'. This was a duplicate scan.
                return res.status(200).json({ success: true, message: `Household ${houseId} has already been collected today.` });
            } else {
                // This is an unexpected state (e.g., no log found).
                return res.status(200).json({ success: true, message: `Scan for Household ${houseId} processed.` });
            }
        }
    } catch (err) {
        console.error("DATABASE ERROR in /collect:", err);
        res.status(500).json({ success: false, message: 'Error updating the database.' });
    }
});

// Function to add daily pending logs for all households if they don't exist
async function addDailyPendingLogs() {
  try {
    const now = new Date();
    const istDate = new Date(now.getTime() + (330 * 60 * 1000));
    const today_ist = istDate.toISOString().slice(0, 10);

    // This query is more robust. It inserts 'pending' logs for households
    // that do not have ANY log entry for today's date yet.
    const query = `
        INSERT INTO CollectionLogs (HouseholdID, CollectedOn, Status)
        SELECT h.HouseholdID, GETUTCDATE(), 'pending'
        FROM Households h
        WHERE NOT EXISTS (
            SELECT 1
            FROM CollectionLogs cl
            WHERE cl.HouseholdID = h.HouseholdID
            AND CONVERT(date, cl.CollectedOn AT TIME ZONE 'UTC' AT TIME ZONE 'India Standard Time') = @Today
        )
    `;
    
    const result = await pool.request()
        .input('Today', sql.Date, today_ist)
        .query(query);

    if (result.rowsAffected[0] > 0) {
        console.log(`✅ Inserted ${result.rowsAffected[0]} new 'pending' logs for today (${today_ist}).`);
    } else {
        console.log(`✅ Daily 'pending' logs for ${today_ist} are already present.`);
    }
    // DO NOT close the pool here. It needs to stay open for the /collect route.
  } catch (err) {
    console.error("❌ Error adding daily pending logs:", err);
  }
}

// --- Start Server and Connect to DB ---
const startServer = async () => {
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Database connection pool established.');
        
        // Add pending logs for today on server start
        await addDailyPendingLogs(); 

        const PORT = 5000;
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`👉 Access the scanner at http://localhost:${PORT}/scanner`);
        });
    } catch (err) {
        console.error('❌ Failed to connect to the database. Server not started.', err);
        process.exit(1);
    }
};

startServer();

