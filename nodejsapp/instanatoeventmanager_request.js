//oc new-app https://YOURREPO/instanaEventManager   --name=pushpuller --strategy=source
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
var request = require("request");
//////parameters///////
const instanaHost = "INSTANAHOSTNAME";
const instanaToken = "INSTANATOKEN";
const eventManagerHost =
  "EVENTMANAGERHOSTNAME";
const eventManagerTokenName =
  "EVENTMANAGERTOKENNAME";
const eventManagerTokenSecret = "EVENTMANAGERTOKENSECRET";
const intervalSeconds = 300;
/////end parameters/////

var the_interval = intervalSeconds * 1000;
console.log(new Date().toUTCString());

setInterval(async function () {
main();
}, the_interval);

async function main() {

  let plugins = [
    "host",
    "nodeJsRuntimePlatform",
    "containerd",
    "crio",
    "docker",
    "etcd",
    "jvmRuntimePlatform",
    "kubernetesCluster",
    "kubernetesNode",
    "kubernetesPod",
    "process",
  ];

  //get metrics

  let resp = { groups: [] };

  for (let i = 0; i < plugins.length; i++) {
    let metric = await getMetrics(plugins[i]);
    for (let j = 0; j < metric.length - 1; j += 5) {
      let body = {
        metrics: [],
        plugin: `${plugins[i]}`,
        query: `entity.type:${plugins[i]}`,
        rollup: intervalSeconds,
      };
      //only add existing metrics and only in sets of 5
      if (metric[j]) {
        body.metrics.push(metric[j]);
      }
      if (metric[j + 1]) {
        body.metrics.push(metric[j + 1]);
      }
      if (metric[j + 2]) {
        body.metrics.push(metric[j + 2]);
      }
      if (metric[j + 3]) {
        body.metrics.push(metric[j + 3]);
      }
      if (metric[j + 4]) {
        body.metrics.push(metric[j + 4]);
      }

      let response = await requestWithRetry(body);
      console.log(`###### ${plugins[i]} ok ######`);
      resp.groups.push(...response);
    }
  }

  //console.debug(JSON.stringify(resp));

  //merge all instana data
  //console.debug(JSON.stringify(resp));

  //post data to metric manager
  request.post(
    {
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(
            `${eventManagerTokenName}:${eventManagerTokenSecret}`
          ).toString("base64"),
        "X-TenantID": eventManagerTokenName.substring(
          0,
          eventManagerTokenName.indexOf("/")
        ),
      },
      url: `https://${eventManagerHost}/metrics/api/1.0/metrics`,
      body: JSON.stringify(resp),
    },
    function (error, response, body) {

      console.log(
        `Event Manager response code ${response.statusCode} with body ${body}`
      );
      if (response.statusCode != 200) {
        console.log(JSON.stringify(resp));
      }
    }
  );
}

//function to call InstanaAPI and Parse in MetricManagerFormat
function requestWithRetry(body) {
  return new Promise((resolve, reject) => {
    request.post(
      {
        headers: {
          "Content-Type": "application/json",
          authorization: `apiToken ${instanaToken}`,
        },
        url: `https://${instanaHost}/api/infrastructure-monitoring/metrics`,
        body: JSON.stringify(body),
      },
      function (error, response, body) {
        if (error) {
          console.error(error);
          reject(error);
        } else if (response.statusCode == 200) {
          //console.log(body)
          let input = JSON.parse(body);
          let array = [];
          input.items.forEach((element) => {
            //console.log('element %s',element)
            for (let i = 0; i < Object.keys(element.metrics).length - 2; i++) {
              try {
                let object = {
                  timestamp: null,
                  resourceID: element.label,
                  metrics: {},
                  attributes: {
                    node: element.label,
                    group: "Instana",
                  },
                };

                let metrics = {};
                Object.keys(element.metrics).forEach((metric) => {
                  let metriccname = metric.replace(".", "");
                  if (
                    element.metrics[metric][i] &&
                    element.metrics[metric][i].length > 0
                  ) {
                    metrics[metriccname] = element.metrics[metric][i][1];
                    object.timestamp = element.metrics[metric][i][0];
                  }
                });
                object.metrics = metrics;
                if (object.timestamp) {
                  array.push(object);
                }
              } catch {
                console.error("SOMETHING WENT WRONG");
                console.error(JSON.stringify(element));
              }
              //console.error("SOMETHING WENT right (SOMEHOW)")
              //console.error(JSON.stringify(element))
            }
          });
          return resolve(array);
        } else {
          console.error(`Instana responsed with ${response.statusCode}`);
          console.error(`Error Body ${body}`);
          return resolve([]);
        }
      }
    );
  });
}

function getMetrics(plugin) {
  return new Promise((resolve, reject) => {
    let metric = [];
    request.get(
      {
        headers: {
          "Content-Type": "application/json",
          authorization: `apiToken ${instanaToken}`,
        },
        url: `https://${instanaHost}/api/infrastructure-monitoring/catalog/metrics/${plugin}`,
      },
      function (error, response, body) {
        if (body) {
          try {
            JSON.parse(body).forEach((element) => {
              metric.push(element.metricId);
            });
          } catch {
            console.error("SOMETHING WENT WRONG");
          }
        } else {
          return reject(error);
        }
        return resolve(metric);
      }
    );
  });
}
