You can define your own streams and retrieve real-time data from multiple exchanges, over a single web socket

* connection to exchanges will be open on-demand (ie: when a ws connection is made to the stream)
* connection to exchanges will be closed when last connection to the stream has been closed
* stream subscriptions can be edited while clients are connected
* all ws connections will be automatically closed upon stream deletion
