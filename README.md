# Концептуальное описание (ридми будет потом):

## Задеплоенный проект

https://lvalue.linkoo.dev


## Как деплоить

1. Установить Docker Engine и make
2. Заполнить .env.example в .env
3. Заполнить python/.env.example в python/.env
4. Заполнить nginx/default.conf.example в nginx/default.conf
5. Прописать `make up`
6. Можно ещё прогнать тесты через `make test`


## Part 1. Observability.

Clause 1.  
We model infrastructure as set of hosts, each described as a set of fields having arbitrary structure. There are  
1. Type field  
2. Internal identifier field  
3. A set of descriptive fields  
  
Clause 2.  
Infrastructure definition happens on basis of set of agents: programs that are executed on target hosts, and attached to a project (so term "project infrastructure" applied).  
  
Clause 3.  
Infrastructure analysis happens in scope of environment, consisting of set of hosts. Each host describes an entity that hosts agent (note that it's always have some operating system like Linux, Windows or OpenWRT).  
  
Clause 4.  
Host agent is the Rust binary application installed as daemon service on an target OS. This service capable of pulling tasks from the backend and executing tasks. Tasks is atomic unit of process of gathering data that then will be used for analysis. All tasks and their results are scoped to environment until stated otherwise (see clause 8).  
  
Clause 5.  
Host identity is environment-scoped agent identity (and hence exists only in scope of an environment; one agent can have  
multiply hosts at it's added into multiply environments). Host is defined by agent and a set of tasks with their results.  
When we speak about tasks and their results for some host, we can say that it's a telemetry of the task.  
  
Examples of such a telemetry:  
1. Pv4 interfaces configuration info.  
2. Ethernet interfaces configuration.  
3. Ethernet interface statistics snapshot.  
4. HTTPS server endpoint connectivity to HTTPS client endpoint (TCP/IP stats + L7 info).  
  
Clause 6.  
There are tasks scheduling mechanism in addition to manual task assignation.  Currently supported only CRON-based tasks   
scheduling mechanism: a task template may be created along with CRON scheduling rule.  
  
Clause 7.  
The only source of raw host telemetry data is tasks execution. But there are ways to get derived telemetry, called   
metric telemetry. Such telemetry loses some details of raw telemetry but often more convenient for casual analysis.  
There are builtin, configurable metrics for builtin tasks.  
  
Examples of builtin metrics:  
1. Network endpoint connectivity statistics  
2. CPU usage statistics  
3. Host resources degradation statistics  
  
Backend must support metrics up-to-date. CRON tasks scheduling rule may be used in order to define logic of raw telemetry supplement, and then fresh aggregate must be computed.  
  
Clause 8.  
There is subset of telemetry that leaks to infrastructure definition level as agent metadata. It's OS name, hostname and   
IP addressing information. This aspects are inspected once by automatically assigned tasks (which assigned once agents   
created, completed once host online, and some policies may be applied for renewal of these data).  
  
Clause 9.  
To represent environment for user, we use graph as primary data structure, where vertices stands for hosts and edges   
stands for telemetry representation.  
  
Clause 10.  
Currently, we support at least such a type of telemetry that can be represented as edges:  
1. Endpoint connectivity (single task result or CRON, so last attempt displayed (with expiry indication), or metric that displays computed telemetry on top of tasks results).

## Part 2. Compliance.

Clause 11.
Compliance stands for distinguishing desired states of system from undesired. White unit of unit of observed system behavior is telemetry entity (task result or metric snapshot), the unit of compliance is a rule. For given valid telemetry entity, rule defines whether it's desired entity or not.

Clause 12.
Formally, we can call compliance just a spe

Clause 13.
As a rule of thumb, structure of a rule is determined on basis of corresponding telemetry entity structure by enumeration of qualities, required to classify telemetry entity as desired (whitelist) or as undesired (blacklist).

Clause 14.
todo

Clause 15.
For end user, compliance domain represented as set of entity-specific tables; each table is by default function in blacklist mode, but can be switched to whitelist mode.
