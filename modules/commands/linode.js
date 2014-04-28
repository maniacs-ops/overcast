var _ = require('lodash');
var readline = require('readline');
var Promise = require('bluebird');
var utils = require('../utils');
var API = require('../providers/linode.js');
var instanceCommand = require('./instance.js');

exports.run = function (args) {
  utils.argShift(args, 'subcommand');
  utils.argShift(args, 'name');

  if (!args.subcommand || !subcommands[args.subcommand]) {
    return utils.missingCommand(exports.help);
  }

  if (args.name === 'help' && subcommands[args.subcommand].help) {
    console.log('');
    return subcommands[args.subcommand].help();
  }

  if (/^(create|datacenters|distributions|kernels|linodes|plans)$/.test(args.subcommand)) {
    return subcommands[args.subcommand](args);
  }

  if (!args.name) {
    return utils.missingParameter('[name]', subcommands[args.subcommand].help || exports.help);
  }

  var instance = utils.findFirstMatchingInstance(args.name);
  utils.handleInstanceNotFound(instance, args);

  if (instance.linode && instance.linode.id) {
    subcommands[args.subcommand](instance, args);
  } else {
    API.getLinodes({ 'linode-name': instance.name }).then(function (linodes) {
      instance.linode = linodes[0];
      utils.updateInstance(instance.name, { linode: instance.linode });
      subcommands[args.subcommand](instance, args);
    }).catch(API.errorCatcher);
  }
};

var subcommands = {};

subcommands.boot = function (instance) {
  API.bootLinode({ 'linode-name': instance.name })
    .then(API.waitForPendingJobs)
    .then(function () {
      utils.waitForBoot();
    });
};

subcommands.boot.help = function () {
  utils.printArray([
    'overcast linode boot [name]',
    '  Boot a powered off linode.'.grey
  ]);
};

subcommands.create = function (args) {
  var clusters = utils.getClusters();

  if (!args.name) {
    return utils.missingParameter('[name]', subcommands.create.help);
  } else if (!args.cluster) {
    return utils.missingParameter('--cluster', subcommands.create.help);
  } else if (!clusters[args.cluster]) {
    return utils.die('No "' + args.cluster + '" cluster found. Known clusters are: ' +
      _.keys(clusters).join(', ') + '.');
  } else if (clusters[args.cluster].instances[args.name]) {
    return utils.dieWithList('Instance "' + args.name + '" already exists.');
  }

  API.create(args).then(function (res) {
    return new Promise(function (resolve) {
      utils.waitForBoot(function () {
        resolve(res);
      });
    });
  }).then(function (res) {
    var instance = {
      ip: res.linode.ip,
      name: args.name,
      ssh_key: args['ssh-key'] || 'overcast.key',
      ssh_port: '22',
      user: 'root',
      linode: res.linode
    };

    var clusters = utils.getClusters();
    clusters[args.cluster] = clusters[args.cluster] || { instances: {} };
    clusters[args.cluster].instances[args.name] = instance;
    utils.saveClusters(clusters);
    utils.success('Instance "' + args.name + '" (' + instance.ip + ') saved.');
  });
};

subcommands.create.help = function () {
  utils.printArray([
    'overcast linode create [name] [options]',
    '  Creates a new Linode.'.grey,
    '',
    '    Option                    | Default'.grey,
    '    --cluster CLUSTER         |'.grey,
    '    --datacenter-slug NAME    | newark'.grey,
    '    --datacenter-id ID        |'.grey,
    '    --distribution-slug NAME  | ubuntu-14-04-lts'.grey,
    '    --distribution-id ID      |'.grey,
    '    --kernel-id ID            |'.grey,
    '    --kernel-name NAME        | Latest 64 bit'.grey,
    '    --payment-term ID         | 1 (monthly, if not metered)'.grey,
    '    --plan-id ID              |'.grey,
    '    --plan-slug NAME          | 2048'.grey,
    '    --password PASSWORD       | autogenerated'.grey,
    ('    --ssh-key KEY_PATH        | overcast.key').grey,
    ('    --ssh-pub-key KEY_PATH    | overcast.key.pub').grey,
    '',
    '  Example:'.grey,
    '  $ overcast linode create db.01 --cluster db --datacenter-slug london'.grey
  ]);
};

subcommands.datacenters = function () {
  API.getDatacenters().then(function (datacenters) {
    utils.printCollection('datacenters', datacenters);
  });
};

subcommands.datacenters.help = function () {
  utils.printArray([
    'overcast linode datacenters',
    '  List available Linode datacenters.'.grey
  ]);
};

subcommands.destroy = function (instance, args) {
  function destroy() {
    API.shutdownLinode({ 'linode-name': instance.name })
      .then(API.deleteDisks)
      .then(API.deleteLinode)
      .catch(API.errorCatcher).then(function () {
        utils.success('Linode "' + instance.name + '" deleted.');
        instanceCommand.run({ '_': [ 'remove', instance.name ] });
      });
  }

  if (args.force) {
    return destroy();
  }

  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Do you really want to destroy this linode? [Y/n]'.yellow, function (answer) {
    rl.close();
    if (answer === 'n' || answer === 'N') {
      utils.grey('No action taken.');
    } else {
      destroy();
    }
  });
};

subcommands.destroy.help = function () {
  utils.printArray([
    'overcast linode destroy [name]',
    '  Destroys a linode and removes it from your account.'.grey,
    '  Using --force overrides the confirm dialog. This is irreversible.'.grey,
    '',
    '    Option                    | Default'.grey,
    '    --force                   | false'.grey
  ]);
};

subcommands.distributions = function () {
  API.getDistributions().then(function (distributions) {
    utils.printCollection('distributions', distributions);
  });
};

subcommands.distributions.help = function () {
  utils.printArray([
    'overcast linode distributions',
    '  List available Linode distributions.'.grey
  ]);
};

subcommands.kernels = function () {
  API.getKernels().then(function (kernels) {
    utils.printCollection('kernels', kernels);
  });
};

subcommands.kernels.help = function () {
  utils.printArray([
    'overcast linode kernels',
    '  List available Linode kernels.'.grey
  ]);
};

subcommands.linodes = function () {
  API.getLinodes().then(function (linodes) {
    utils.printCollection('linodes', linodes);
  });
};

subcommands.linodes.help = function () {
  utils.printArray([
    'overcast linode linodes',
    '  List all linodes in your account.'.grey
  ]);
};

subcommands.plans = function () {
  API.getPlans().then(function (plans) {
    utils.printCollection('plans', plans);
  });
};

subcommands.plans.help = function () {
  utils.printArray([
    'overcast linode plans',
    '  List available Linode plans.'.grey
  ]);
};

subcommands.reboot = function (instance) {
  API.rebootLinode({ 'linode-name': instance.name })
    .then(API.waitForPendingJobs)
    .then(function () {
      utils.waitForBoot();
    });
};

subcommands.reboot.help = function () {
  utils.printArray([
    'overcast linode reboot [name]',
    '  Reboots a linode.'.grey
  ]);
};


subcommands.resize = function (instance, args) {
  var data = { 'linode-name': instance.name };
  if (args['plan-id']) {
    data['plan-id'] = args['plan-id'];
  } else if (args['plan-slug']) {
    data['plan-slug'] = args['plan-slug'];
  }
  API.resizeLinode(data).then(function () {
    utils.success('Linode resized.');
  });
};

subcommands.resize.help = function () {
  utils.printArray([
    'overcast linode resize [name] [options]',
    '  Resizes a linode to the specified plan. This will immediately shutdown and migrate your linode.'.grey,
    '',
    '    Option                    | Default'.grey,
    '    --plan-id ID              |'.grey,
    '    --plan-slug NAME          |'.grey
  ]);
};

subcommands.shutdown = function (instance) {
  API.shutdownLinode({ 'linode-name': instance.name })
    .then(API.waitForPendingJobs)
    .then(function () {
      utils.success('OK, server is shutdown.');
    });
};

subcommands.shutdown.help = function () {
  utils.printArray([
    'overcast linode shutdown [name]',
    '  Shut down a linode.'.grey
  ]);
};

exports.signatures = function () {
  return [
    '  overcast linode boot [name]',
    '  overcast linode create [name] [options]',
    '  overcast linode datacenters',
    '  overcast linode destroy [name]',
    '  overcast linode distributions',
    '  overcast linode kernels',
    '  overcast linode linodes',
    '  overcast linode plans',
    '  overcast linode reboot [name]',
    '  overcast linode shutdown [name]'
  ];
};

exports.help = function () {
  utils.printArray([
    'These functions require LINODE_API_KEY property to be set in .overcast/variables.json.',
    'API keys can be found at https://manager.linode.com/profile/api',
    ''
  ]);

  utils.printCommandHelp(subcommands);
};
