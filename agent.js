const { ServiceBroker } = require("moleculer");

const nodeID = require("os").hostname()
const middlewares = require("middlewares");

const config = {
    namespace: "broker",
    hotReload: false,
    nodeID,
    transporter: process.env.TRANSPORT,
    middlewares,
}

// Create broker
const broker = new ServiceBroker(config);

const loadService = (path) => {
    try {
        broker.loadService(path);
    } catch (e) {
        console.log(e)
    }
}


if(process.env.AGENT=='yes'){
    loadService("./agents/repos.git.agent");
}else{
    loadService("./services/repos.service");
    loadService("./services/repos.commits.service");
}

// Start server
broker.start()
module.exports = broker