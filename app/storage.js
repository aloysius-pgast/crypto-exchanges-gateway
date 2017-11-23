"use strict";
const sqlite3 = require('sqlite3');
const path = require('path');
const _ = require('lodash');
const logger = require('winston');
const fs = require('fs');

class Storage
{

constructor()
{
    this._storageDir = path.join(__dirname, '../storage');
    this._databaseDir = `${this._storageDir}/db`;
    this._sqlDir = `${this._storageDir}/sql`;
    this._db = null;
}

storeSession(sid, obj)
{
    let query = "INSERT OR REPLACE INTO sessions(sid, data) VALUES($sid, $data)";
    this._db.run(query, {$sid:sid, $data:JSON.stringify(obj)}, function(err){
        if (null === err)
        {
            return;
        }
        logger.error("Could not save session '%s' : %s", sid, err.message);
    });
}

removeSession(sid)
{
    let query = "DELETE FROM sessions WHERE sid = $sid";
    this._db.run(query, {$sid:sid}, function(err){
        if (null === err)
        {
            return;
        }
        logger.error("Could not remove session '%s' : %s", sid, err.message);
    });
}

loadData()
{
    let self = this;
    let promises = [
        self._loadSessions()
    ];
    return Promise.all(promises);
}

_loadSessions()
{
    let self = this;
    return new Promise((resolve, reject) => {
        self._db.all('SELECT * FROM sessions', function(err, rows){
            let count = 0;
            if (null !== err)
            {
                logger.error('Could not load sessions : %s', err.message);
                reject();
                return;
            }
            _.forEach(rows, (r) => {
                let obj;
                try
                {
                    obj = JSON.parse(r.data);
                    ++count;
                }
                catch (e)
                {
                    logger.error("Session '%s' contains invalid JSON, entry will be removed", r.sid);
                    self.removeSession.call(self, r.sid);
                    return;
                }
                sessionRegistry.restoreSession(r.sid, obj);
            });
            logger.info('%d sessions loaded', count);
            resolve();
        });
    });
}

close()
{
    if (null === this._db)
    {
        return;
    }
    this._db.close();
}

checkDatabase()
{
    if (!fs.existsSync(this._databaseDir))
    {
        logger.info(`Database directory '${this._databaseDir}' will be created`);
        try
        {
            fs.mkdirSync(this._databaseDir);
        }
        catch (e)
        {
            logger.warn(`Could not create database directory : ${e.message}`);
            return Promise.reject();
        }
    }
    let self = this;
    return new Promise((resolve, reject) => {
        let tables = {}
        try
        {
            fs.readdirSync(self._sqlDir).forEach(filename => {
                let m = filename.match(/^table\.([a-zA-Z0-9._]+)\.sql$/);
                if (null === m)
                {
                    return;
                }
                let file = `${self._sqlDir}/${filename}`;
                let content = fs.readFileSync(file, 'utf8');
                tables[m[1]] = content;
            })
        }
        catch (e)
        {
            logger.warn(`Could not load sql files : ${e.message}`);
            reject();
            return;
        }
        // open/create database
        let dbFilename = `${this._databaseDir}/database.sqlite`;
        self._db = new sqlite3.Database(dbFilename, function(err){
            // an error occured
            if (null !== err)
            {
                logger.warn(`Could not open database : ${err.message}`);
                reject();
                return;
            }
            let promises = [];
            _.forEach(tables, (content, name) => {
                let p = new Promise((res, rej) => {
                    self._db.run(content, function(err){
                        if (null !== err)
                        {
                            logger.error("Could not create table '%s' : %s", name, err.message);
                            rej();
                            return;
                        }
                        res();
                    });
                });
                promises.push(p);
            });
            Promise.all(promises).then(() => {
                logger.info("Database is ok");
                resolve();
            }).catch (() => {
                reject();
            });
        });
    });
}

}

let instance = new Storage();
module.exports = instance;

const sessionRegistry = require('./session-registry');
