CREATE TABLE IF NOT EXISTS tickerMonitor(
    id INTEGER,
    name TEXT,
    enabled INTEGER,
    updateTimestamp INTEGER,
    data TEXT,
    PRIMARY KEY(id ASC)
);
CREATE INDEX IF NOT EXISTS name ON tickerMonitor ASC;
