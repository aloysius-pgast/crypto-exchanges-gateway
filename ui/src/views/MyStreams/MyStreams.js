import React, { Component } from 'react';
import restClient from '../../lib/RestClient';
import serviceRegistry from '../../lib/ServiceRegistry';
import dataStore from '../../lib/DataStore';

// components
import Sessions from '../../components/Sessions';
import SessionEditor from '../../components/SessionEditor';
import SubscriptionEditor from '../../components/SubscriptionEditor';

class MyStreams extends Component
{

constructor(props) {
   super(props);
   this.state = {
       sessions:{loaded:false, isRefreshing:false, list:null, sidList:null, err:null},
       creatingSession:{enabled:false, sid:null, err:null},
       deletingSession:{enabled:false, sid:null, err:null},
       editingSession:{enabled:false, isNew:false, session:null},
       editingSubscription:{enabled:false, sid:null, size:0},
       addingSubscription:{enabled:false, item:null, err:null},
       deletingSubscription:{enabled:false, item:null, err:null}
   }
   this._handleCreateSession = this._handleCreateSession.bind(this);
   this._handleDeleteSession = this._handleDeleteSession.bind(this);
   this._handleStartEditingSession = this._handleStartEditingSession.bind(this);
   this._handleStopEditingSession = this._handleStopEditingSession.bind(this);
   this._handleStartEditingSubscription = this._handleStartEditingSubscription.bind(this);
   this._handleStopEditingSubscription = this._handleStopEditingSubscription.bind(this);
   this._handleCheckSubscription = this._handleCheckSubscription.bind(this);
   this._handleAddSubscription = this._handleAddSubscription.bind(this);
   this._handleDeleteSubscription = this._handleDeleteSubscription.bind(this);
}

_handleCreateSession(sid)
{
    this.setState({creatingSession:{enabled:true, sid:sid, err:null}}, () => {
        restClient.createSession(sid).then(() => {
            if (!this._isMounted)
            {
                return;
            }
            this.setState({creatingSession:{enabled:false, sid:null, err:null}}, () => {
                this._loadSessions(true, () => {
                    this.setState({editingSession:{enabled:true,isNew:true,session:this.state.sessions.list[sid]}})
                });
            });
        }).catch ((err) => {
            if (!this._isMounted)
            {
                return;
            }
            this.setState({creatingSession:{enabled:false, sid:null, err:err}});
        });
    });
}

_handleDeleteSession(sid)
{
    this.setState({deletingSession:{enabled:true, sid:sid, err:null}}, () => {
        restClient.deleteSession(sid).then(() => {
            if (!this._isMounted)
            {
                return;
            }
            this._loadSessions(true, () => {
                this.setState({deletingSession:{enabled:false, sid:null, err:null}});
            });
        }).catch ((err) => {
            if (!this._isMounted)
            {
                return;
            }
            this.setState({deletingSession:{enabled:false, sid:null, err:err}});
        });
    });
}

_handleStartEditingSession(sid)
{
    this.setState({editingSession:{enabled:true,isNew:false,session:this.state.sessions.list[sid]}});
}

_handleStopEditingSession()
{
    this.setState({
        editingSession:{enabled:false,isNew:false,session:null},
        editingSubscription:{enabled:false,sid:null,size:0},
        addingSubscription:{enabled:false, item:null, err:null}
    });
}

_handleStartEditingSubscription(sid)
{
    this.setState({editingSubscription:{enabled:true, sid:sid, size:this.state.sessions.list[sid].subscriptions.length}});
}

_handleStopEditingSubscription()
{
    this.setState({
        editingSubscription:{enabled:false,sid:null,size:0},
        addingSubscription:{enabled:false, item:null, err:null}
    });
}

/**
 * @return {boolean} true if subscription does not exist, false otherwise
 */
_handleCheckSubscription(item)
{
    if (undefined === this.state.sessions.list[item.sid])
    {
        return true;
    }
    let found = false;
    _.forEach(this.state.sessions.list[item.sid].subscriptions, (s) => {
        if (item.exchange != s.exchange)
        {
            return;
        }
        if (item.pair != s.pair)
        {
            return;
        }
        if (item.type != s.type || ('klines' == item.type && item.klinesInterval != s.klinesInterval))
        {
            return;
        }
        found = true;
        return false;
    });
    return !found;
}

_handleAddSubscription(item)
{
    this.setState({addingSubscription:{enabled:true, item:item, err:null}}, () => {
        restClient.addSessionSubscription(item.sid, item.exchange, item.type, item.pair, item.klinesInterval).then(() => {
            if (!this._isMounted)
            {
                return;
            }
            this._loadSessions(true, () => {
                setTimeout(() => {
                this.setState((prevState, props) => {
                    let state = {
                        addingSubscription:{enabled:false, item:null, err:null},
                        editingSession:prevState.editingSession,
                        editingSubscription:prevState.editingSubscription
                    }
                    state.editingSession.session = this.state.sessions.list[item.sid];
                    state.editingSubscription.size = state.editingSession.session.subscriptions.length;
                    return state;
                });
            },100);
            });
        }).catch ((err) => {
            if (!this._isMounted)
            {
                return;
            }
            this.setState({addingSubscription:{enabled:false, item:null, err:err}});
        });
    });
}

_handleDeleteSubscription(item)
{
    this.setState({deletingSubscription:{enabled:true, item:item, err:null}}, () => {
        restClient.deleteSessionSubscription(item.sid, item.exchange, item.type, item.pair, item.klinesInterval).then(() => {
            if (!this._isMounted)
            {
                return;
            }
            this._loadSessions(true, () => {
                this.setState((prevState, props) => {
                    let state = {
                        editingSession:prevState.editingSession,
                        deletingSubscription:{enabled:false, item:null, err:null},
                        editingSubscription:prevState.editingSubscription,
                    }
                    state.editingSession.session = this.state.sessions.list[item.sid];
                    state.editingSubscription.size = state.editingSession.session.subscriptions.length;
                    return state;
                });
            });
        }).catch ((err) => {
            if (!this._isMounted)
            {
                return;
            }
            this.setState({deletingSubscription:{enabled:false, item:null, err:err}});
        });
    });
}

_loadSessions(isRefreshing, cb)
{
    this.setState((prevState, props) => {
        let state = prevState.sessions;
        state.isRefreshing = isRefreshing;
        return {sessions:state};
    }, () => {
        restClient.listSessions().then((data) => {
            if (!this._isMounted)
            {
                return;
            }
            let list = {};
            let filteredSubscriptions = ['tickers', 'orderBooks', 'trades', 'klines'];
            let substrIndex = 'mystream.'.length;
            _.forEach(data, (session, sid) => {
                let entry = {sid:sid, creationTimestamp:session.creationTimestamp, name:sid.substr(substrIndex), subscriptions:[]};
                _.forEach(session.subscriptions, (list, exchange) => {
                    _.forEach(filteredSubscriptions, (type) => {
                        if (undefined !== list[type] && undefined !== list[type].pairs)
                        {
                            let exchangeName = serviceRegistry.getExchangeName(exchange);
                            _.forEach(list[type].pairs, (e, pair) => {
                                if ('klines' != type)
                                {
                                    entry.subscriptions.push({
                                        exchange:exchange,
                                        exchangeName:exchangeName,
                                        type:type,
                                        pair:pair,
                                        timestamp:e.timestamp
                                    });
                                }
                                else
                                {
                                    _.forEach(e, (obj, interval) => {
                                        entry.subscriptions.push({
                                            exchange:exchange,
                                            exchangeName:exchangeName,
                                            type:type,
                                            pair:pair,
                                            klinesInterval:interval,
                                            timestamp:obj.timestamp
                                        });
                                    });
                                }
                            });
                        }
                    });
                });
                if (0 != entry.subscriptions.length)
                {
                    entry.subscriptions = entry.subscriptions.sort((a,b) => {
                        return (b.timestamp - a.timestamp);
                    });
                }
                list[entry.sid] = entry;
            });
            // sort by timestamp
            let sortedList = Object.values(list).sort(function(a,b){
                return (b.creationTimestamp - a.creationTimestamp);
            });
            let sidList = _.map(sortedList, (e) => {return e.sid});
            this.setState((prevState, props) => {
                let state = {loaded:true, isRefreshing:false, list:list, sidList:sidList , err:null};
                return {sessions:state};
            }, () => {
                if (undefined !== cb)
                {
                    cb();
                }
            });
        }).catch ((err) => {
            if (!this._isMounted)
            {
                return;
            }
            this.setState((prevState, props) => {
                let state = {loaded:true, isRefreshing:false, list:null, sidList:null, err:err};
                return {sessions:state};
            }, () => {
                if (undefined !== cb)
                {
                    cb();
                }
            });
        });
    });
}

componentWillReceiveProps(nextProps) {}

componentWillUnmount()
{
    this._isMounted = false;
}

componentDidMount()
{
    this._isMounted = true;
    this._loadSessions(false);
}

render()
{
    let isDisabled = this.state.creatingSession.enabled ||
        this.state.deletingSession.enabled ||
        this.state.addingSubscription.enabled ||
        this.state.deletingSubscription.enabled;

    const maxSubscriptionsWarning = (cfg) => {
        if (0 == cfg.sessions.maxSubscriptions)
        {
            return null;
        }
        return (
            <div>Maximum number of subscriptions per stream is {cfg.sessions.maxSubscriptions}<br/></div>
        );
    }

    const maxDurationWarning = (cfg) => {
        if (0 == cfg.sessions.maxDuration)
        {
            return null;
        }
        let durationUnit = 'seconds';
        let duration = cfg.sessions.maxDuration;
        if (duration >= 3600)
        {
            duration = Math.floor(duration / 60.0);
            durationUnit = 'minutes';
            if (duration >= 14400)
            {
                duration = math.floor(duration / 60.0);
                durationUnit = 'hours';
            }
        }
        return (
            <div>Streams will be automatically destroyed after {duration} {durationUnit}<br/></div>
        );
    }

    const Warnings = () => {
        let cfg = dataStore.getData('serverConfig');
        if (0 == cfg.sessions.maxSubscriptions && 0 == cfg.sessions.maxDuration)
        {
            return null;
        }
        return (<div style={{marginTop:'10px',color:'#e64400'}}>
            {maxSubscriptionsWarning(cfg)}
            {maxDurationWarning(cfg)}
        </div>);
    }

    return (
      <div className="animated fadeIn" style={{marginBottom:'150px'}}>
        <Warnings/>
        <Sessions
            sessions={this.state.sessions}
            isDisabled={isDisabled}
            isEditing={this.state.editingSession}
            isCreating={this.state.creatingSession}
            isDeleting={this.state.deletingSession}
            onDelete={this._handleDeleteSession}
            onEdit={this._handleStartEditingSession}
            onCreate={this._handleCreateSession}
        />
        <SessionEditor
            isDisabled={isDisabled}
            isEditing={this.state.editingSession}
            isDeleting={this.state.deletingSubscription}
            onEdit={this._handleStartEditingSubscription}
            onClose={this._handleStopEditingSession}
            onDelete={this._handleDeleteSubscription}
        />
        <SubscriptionEditor
            isDisabled={isDisabled}
            isAdding={this.state.addingSubscription}
            isEditing={this.state.editingSubscription}
            onAdd={this._handleAddSubscription}
            onClose={this._handleStopEditingSubscription}
            onCheckSubscription={this._handleCheckSubscription}
        />
      </div>
    )
}

}

export default MyStreams;
