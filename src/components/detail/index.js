import React from 'react';
import {Icon, Divider, Collapse, Table, Button, Modal, Row, Col, Select, Form, Input, InputNumber, Menu, Dropdown, Checkbox, notification } from 'antd';
import { Link } from 'react-router-dom';
import {
    getDetail, getAppCanaryInfo, getReleases, appDeploy, appDeployCanary,
    appDeleteCanary, appSetABTestingRules, appGetABTestingRules, appScale, appRollback,
    appRenew, getCluster, appPostConfigMap, appGetConfigMap, appPostSecret, appGetSecret } from 'api';
import emitter from "../event";

import brace from 'brace';
import AceEditor from 'react-ace';

import 'brace/mode/json';
import 'brace/theme/xcode';

import './index.css';
const Panel = Collapse.Panel;
const { TextArea } = Input;
const FormItem = Form.Item;
const Option = Select.Option;

const formItemLayout = {
    labelCol: {
        xs: { span: 24 },
        sm: { span: 5 },
    },
    wrapperCol: {
        xs: { span: 30 },
        sm: { span: 18 },
    },
};

const spanStyle = {
    padding: '0 4px',
    marginRight: '4px',
    background: '#eee',
    border: '1px solid #ccc',
    borderRadius: '6px'
}

let abtestingRulesValue = '';

function onChange(newValue) {
    abtestingRulesValue = newValue
    // console.log(newValue)
}

function extractDataFromPod(pod) {
    var msToHuman = function(ms) {
        var numdays, numhours, numminutes;
        var seconds = ms / 1000;
        numdays = Math.floor(seconds / 86400);
        if (numdays > 0) {
            return numdays + 'd';
        }
        numhours = Math.floor(seconds / 3600);
        if (numhours > 0) {
            return numhours + 'h';
        }
        numminutes = Math.floor(seconds / 60);
        if (numminutes > 0) {
            return numminutes + 'm';
        }
        return seconds + 's';
    }
    let status = pod.status.phase;
    // get ready count
    let restart_count = 0;
    let ready_count = 0;
    let ready_total = pod.spec.containers.length;
    if (pod.status.container_statuses) {
        for (let cont_status of pod.status.container_statuses) {
            if (cont_status.ready) {
                ready_count++;
            } else {
                if (cont_status.state.terminated) {
                    status = cont_status.state.terminated.reason
                } else if (cont_status.state.waiting) {
                    status = cont_status.state.waiting.reason
                }
            }
            if (cont_status.restart_count > restart_count) {
                restart_count = cont_status.restart_count;
            }
        }
    }
    let start_time_str = pod.status.start_time;
    if (start_time_str && !start_time_str.endsWith("GMT")) {
        start_time_str += " GMT";
    }
    let start_time = new Date(start_time_str);
    let interval = Date.now() - start_time;

    let data = {
        ready: ready_count + "/" + ready_total,
        name: pod.metadata.name,
        status: status,
        restarts: restart_count,
        age: msToHuman(interval),
        ip: pod.status.pod_ip,
        node: pod.status.host_ip
    }
    return data
}

function getArg(name) {
    var i = new RegExp("(\\?|&)" + name + "=([^&]+)(&|$)","i")
        , n = location.href.match(i);
    return n ? n[2]:false;
}
class AppDetail extends React.Component {

    constructor() {
        super();
        this.handleSecret = this.handleSecret.bind(this)

        let self = this;
        this.state = {
            infoModal: {
                text: '',
                title: '',
                visible: false
            },
            deployModal: {
                title: '',
                visible: false,
                replicas: -1,
                canary: false
            },
            example: '',
            name: '',
            nowTag: '',
            replicas: 1,
            version: '',
            nowCluster: '',
            scaleNum: 1,
            data: [],
            tableData: [],
            podTableData: [],
            canarypodTableData: [],
            textVisible: false,
            scaleVisible: false,
            renewVisible: false,
            rollbackVisible: false,
            buildVisible: false,
            configmapVisible: false,
            secretVisible: false,
            canaryVisible: false,
            deleteCanaryVisible: false,
            abtestingVisible: false,
            columns: [
                {
                    title: 'tag',
                    dataIndex: 'tag',
                    width: '14%',
                    render: tag => {
                        let nowVersion = this.state.version === tag;
                        if(nowVersion) {
                            return (
                                <span>{tag} <span style={{fontSize: '12px', color: 'red'}}>(当前版本)</span></span>
                            )
                        }else {
                            return (
                                <span>{tag}</span>
                            )
                        }
                    }
                }, {
                    title: 'created',
                    dataIndex: 'created',
                    width: '15%',
                    defaultSortOrder: 'descend',
                    sorter: (a, b) => {
                        let c = new Date(a.created).getTime();
                        let d = new Date(b.created).getTime();
                        return c - d
                    }
                }, {
                    title: 'updated',
                    dataIndex: 'updated',
                    width: '15%',
                }, {
                    title: 'image',
                    dataIndex: 'image',
                    width: '35%',
                }, {
                    title: 'build_status',
                    dataIndex: 'build_status',
                    width: '10%',
                    render(build_status) {
                        return build_status.toString()
                    }
                }, {
                    title: 'Action',
                    dataIndex: 'action',
                    width: '16%',
                    render(text, record) {
                        const menu = (
                            <Menu>
                                {
                                    record.build_status ? '' : (
                                        <Menu.Item key="0">
                                            <div onClick={() => {self.setState({nowTag: record.tag, buildVisible: true})}}>Build</div>
                                        </Menu.Item>
                                    )
                                }
                                <Menu.Item key="1">
                                    <div onClick={() => {
                                        let deployModal = self.state.deployModal
                                        deployModal.visible = true
                                        deployModal.title = "部署"
                                        deployModal.canary = false
                                        self.setState({nowTag: record.tag, deployModal: deployModal})}}>Deploy</div>
                                </Menu.Item>
                                <Menu.Item key="2">
                                    <div onClick={() => {
                                        let deployModal = self.state.deployModal
                                        deployModal.visible = true
                                        deployModal.title = "部署Canary"
                                        deployModal.canary = true
                                        self.setState({nowTag: record.tag, deployModal: deployModal})}}>Canary</div>
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item key="3">
                                    <div onClick={() => {self.showInfoModal("spec", record.specs_text)}}>Spec Text</div>
                                </Menu.Item>
                            </Menu>
                        );

                        return (
                            <Dropdown overlay={menu} trigger={['click']}>
                                <a className="ant-dropdown-link" href="#">
                                    <div style={{width: '40px', textAlign: 'center'}}>
                                        <Icon type="ellipsis" className="btnIcon" />
                                    </div>
                                </a>
                            </Dropdown>
                        )
                    }
                }
            ],
            podColumns: [
                {
                    title: 'NAME',
                    dataIndex: 'name',
                    width: '15%'
                },
                {
                    title: 'READY',
                    dataIndex: 'ready',
                    width: '10%'
                },
                {
                    title: 'STATUS',
                    dataIndex: 'status',
                    width: '10%'
                },
                {
                    title: 'RESTARTS',
                    dataIndex: 'restarts',
                    width: '10%'
                },
                {
                    title: 'AGE',
                    dataIndex: 'age',
                    width: '15%'
                },
                {
                    title: 'IP',
                    dataIndex: 'ip',
                    width: '15%'
                },
                {
                    title: 'NODE',
                    dataIndex: 'node',
                    width: '15%'
                }
            ]
        }
        this.handleMsg = this.handleMsg.bind(this);
    }

    componentDidMount() {
        let that = this;

        // 获取APP name
        const name = getArg('app'),
            defaultCluster = getArg('cluster');

        // 测试地址
        const testUrl = process.env.NODE_ENV === 'production' ? '' : 'http://192.168.1.17:5000';

        that.setState({
            name: name
        });
        getReleases(name).then(res => {
            that.setState({
                tableData: res
            })
        });

        if(!defaultCluster) {
            getCluster().then(res => {
                getMsg(name, res[0]);
            })
        }else {
            getMsg(name, defaultCluster);
            that.eventEmitter = emitter.addListener("clusterChange",(cluster)=>{
                getMsg(name, cluster);
            });
        }

        function getMsg(name, cluster) {
            that.setState({
                nowCluster: cluster
            })

            getAppCanaryInfo({name:name, cluster:cluster}).then(res => {
                console.log(res)
                that.setState({
                    canaryVisible: res.status
                })
            })
            getDetail({name: name, cluster: cluster}).then(res => {
                that.setState({
                    data: res,
                    version: res.metadata.annotations.release_tag
                })
            }).catch(err => {
                that.handleError(err);
            });

            let prodSchema = "ws:"
            if (window.location.protocol === "https:") {
                prodSchema = "wss:"
            }
            // pods watcher
            createPodsWatcher(name, cluster, false)
            // canary pods watcher
            createPodsWatcher(name, cluster, true)
        }

        function createPodsWatcher(name, cluster, canary) {
            let prodSchema = "ws:"
            if (window.location.protocol === "https:") {
                prodSchema = "wss:"
            }
            const canaryStr = canary? "canary": ""

            const wsUrl = process.env.NODE_ENV === 'production' ? prodSchema + '//'+window.location.host : 'ws://192.168.1.17:5000';
            const ws = new WebSocket(`${wsUrl}/api/v1/ws/app/${name}/pods/events`);
            ws.onopen = function(evt) {
                // console.log("Connection open ...");
                ws.send(`{"cluster": "${cluster}", "canary": ${canary}}`);
            };
            ws.onclose = function(evt) {
                console.warn(`"${canaryStr} pods websocket connection closed"`)
                setTimeout(function() {
                    createPodsWatcher(name, cluster, canary)
                }, 3000);
            }
            ws.onerror = function(evt) {
                console.error(`"${canaryStr} pods websocket connection got an error"`)
                ws.close()
            }
            that.webSocketEvent(ws, canary);
        }
    }

    componentWillMount() {
    }

    // 打开配置弹框
    showInfoModal(title, data) {
        if (!!!data) {
            data = ""
        }
        if (typeof data != 'string') {
             data = JSON.stringify(data, undefined, 2);
        }
        let text = data.replace(/\n/g, '<br/>');
        text = text.replace(/ /g, '&nbsp;&nbsp;');
        this.setState({
            infoModal: {
                title: title,
                text: text,
                visible: true
            }
        });
    }

    // 关闭配置弹框
    hiddenInfoModal() {
        this.setState({
            infoModal: {
                visible: false,
            }
        });
    }

    // Websocket
    webSocketEvent(socket, canary) {
        let self = this;
        socket.addEventListener('message', function (event) {
            let tmp = JSON.parse(event.data);
            let action = tmp.action;
            let data = extractDataFromPod(tmp.object);

            let { canarypodTableData, podTableData } = self.state;
            let temp = canary ? canarypodTableData : podTableData;

            let podIndex = undefined;
            for (const [index, value] of temp.entries()) {
                if (value.name === data.name) {
                    podIndex = index;
                }
            }
            if(action === 'ADDED') {
                if(podIndex === undefined) {
                    temp.push(data);
                } else {
                    temp.splice(podIndex, 1, data);
                }
                if(canary) {
                    self.setState({
                        canarypodTableData: temp
                    })
                }else {
                    self.setState({
                        podTableData: temp
                    })
                }
            }else if(action === 'MODIFIED') {
                if(podIndex !== undefined) {
                    temp.splice(podIndex, 1, data);
                    if(canary) {
                        self.setState({
                            canarypodTableData: temp
                        })
                    }else {
                        self.setState({
                            podTableData: temp
                        })
                    }
                }
            }else if(action === 'DELETED') {
                if(podIndex !== undefined) {
                    temp.splice(podIndex, 1);
                    if(canary) {
                        self.setState({
                            canarypodTableData: temp
                        })
                    }else {
                        self.setState({
                            podTableData: temp
                        })
                    }
                }
            }
        }, false);
    }

    // 构建
    handleBuild() {
        let self = this

        self.setState({buildVisible: false})
        let infoModal = self.state.infoModal
        infoModal.visible = true
        infoModal.title = "Build Output"
        self.setState({infoModal: infoModal})

        let { name, nowTag } = self.state;

        let prodSchema = "ws:"
        if (window.location.protocol === "https:") {
            prodSchema = "wss:"
        }
        const wsUrl = process.env.NODE_ENV === 'production' ? prodSchema + '//'+window.location.host : 'ws://192.168.1.17:5000';
        const ws = new WebSocket(`${wsUrl}/api/v1/ws/app/${name}/build`);
        ws.onopen = function(evt) {
            // console.log("Connection open ...");
            ws.send(`{"tag": "${nowTag}"}`);
        };
        ws.onclose = function(evt) {
            // infoModal.visible = false
            // self.setState({infoModal: infoModal})

            console.log("Build finished")
        }

        let text = ""
        let phase = null
        ws.onmessage = function(evt) {
            let data = JSON.parse(evt.data);
            if (! data.success) {
                text.push(<p key={data.error}>{data.error}</p>)
            } else {
                if (phase !== data['phase']) {
                    text += `<p>***** PHASE ${data.phase}</p>`
                    phase = data['phase']
                }
                if (data.phase.toLowerCase() === "pushing") {
                    let raw_data = data['raw_data']
                    if (raw_data.id && raw_data.status) {
                        text += `<p>${raw_data.id}: ${raw_data.status}</p>`
                    } else if (raw_data.digest) {
                        text += `<p>${raw_data.status}: digest: ${raw_data.digest} size: ${raw_data.size}</p>`
                    } else {
                        text += `<p>${JSON.stringify(data)}</p>`
                    }
                } else {
                    text += `<p>${data.msg}</p>`
                }
            }

            infoModal.text = text
            self.setState({infoModal: infoModal})
        }
    }

    showConfigMap() {
        const {name, nowCluster} = this.state

        appGetConfigMap(name, {cluster: nowCluster}).then(res => {
            this.showInfoModal("ConfigMap", res)
        }).catch(err => {
            this.handleError(err);
        });
    }
    handleConfigMap(e) {
        let { name, nowCluster } = this.state;
        e.preventDefault();
        this.props.form.validateFields((err, values) => {
            if (!err) {
                let data = {
                    data: values.data,
                    cluster: nowCluster
                }
                if (values.filename) {
                    data.config_name = values.filename
                }

                appPostConfigMap(name, data).then(res=> {
                    this.setState({configmapVisible: false})
                    this.handleMsg(res, "Create ConfigMap")
                }).catch(err => {
                    this.handle(err)
                })
            }
        })
    }

    showSecret() {
        const {name, nowCluster} = this.state

        appGetSecret(name, {cluster: nowCluster}).then(res => {
            this.showInfoModal("Secret", res)
        }).catch(err => {
            this.handleError(err);
        });
    }

    handleSecret(keys, values) {
        this.setState({secretVisible: false})
        let { name, nowCluster } = this.state;
        let params = {data: {}, cluster: nowCluster}
        for (const [idx, key] of keys.entries()) {
            let val = values[idx]

            if ((! key) || (! val)) {
                continue
            }
            params.data[key] = val
        }
        appPostSecret(name, params).then(res=> {
            this.handleMsg(res, "Create Secret")
        }).catch(err => {
            this.handle(err)
        })
    }

    // 部署
    handleDeploy() {
        let deployModal = this.state.deployModal
        deployModal.visible = false
        this.setState({deployModal: deployModal})
        let { name, nowTag, nowCluster } = this.state;

        let data = {tag: nowTag, cluster: nowCluster}
        if (deployModal.replicas > 0) {
            data.replicas = deployModal.replicas
        }
        if (deployModal.canary) {
            appDeployCanary(name, data).then(res => {
                this.setState({canaryVisible: true})
                this.handleMsg(res, 'Deploy Canary');
            }).catch(err => {
                this.handleError(err);
            });
        } else {
            appDeploy(name, data).then(res => {
                this.handleMsg(res, 'Deploy');
            }).catch(err => {
                this.handleError(err);
            });
        }
    }

    // 部署canary
    handleDeployCanary() {
        let deployModal = this.state.deployModal
        deployModal.visible = false
        this.setState({deployModal: deployModal})
        let { name, nowTag, nowCluster } = this.state;
        let replicas = deployModal.replicas

        let data = {name: name, tag: nowTag, cluster: nowCluster}
        if (replicas > 0) {
            data.replicas = replicas
        }

        appDeployCanary(name, data).then(res => {
            this.setState({canaryVisible: true})
            this.handleMsg(res, 'Deploy Canary');
        }).catch(err => {
            this.handleError(err);
        });
    }

    // 删除canary
    handleDeleteCanary() {
        this.setState({deleteCanaryVisible: false})
        let { name, nowCluster } = this.state;
        appDeleteCanary({name: name, cluster: nowCluster}).then(res => {
            this.setState({canaryVisible: false})
            this.handleMsg(res, 'Delete Canary');
        }).catch(err => {
            this.handleError(err);
        });
    }

    handleABTestingSubmit(e) {
        const {name, nowCluster} = this.state

        e.preventDefault();
        appSetABTestingRules({
            name: name,
            cluster: nowCluster,
            rules: JSON.parse(abtestingRulesValue)
        }).then(res => {
            this.setState({
                abtestingVisible: false
            })
            this.handleMsg(res, 'SET ABTesting Rules');
        }).catch(err => {
            this.handleError(err);
        });
    }

    showABTestingRules() {
        const {name, nowCluster} = this.state

        appGetABTestingRules({
            name: name,
            cluster: nowCluster
        }).then(res => {
            this.showInfoModal("ABTesting Rules", res)
        }).catch(err => {
            this.handleError(err);
        });
    }

    // 更新
    handleRenew() {
        this.setState({renewVisible: false})
        let {name, nowCluster} = this.state;
        appRenew({name: name, cluster: nowCluster}).then(res => {
            this.handleMsg(res, 'Renew');
        }).catch(err => {
            this.handleError(err);
        });
    }

    // 伸缩
    handleScale() {
        this.setState({scaleVisible: false})
        let {name, scaleNum, nowCluster} = this.state;
        appScale({name: name, replicas: scaleNum, cluster: nowCluster}).then(res => {
            this.handleMsg(res, 'Scale');
        }).catch(err => {
            this.handleError(err);
        });
    }

    // 回滚
    handleRollback() {
        this.setState({rollbackVisible: false})
        let {name, nowCluster} = this.state
        appRollback({name: name, cluster: nowCluster}).then(res => {
            this.handleMsg(res, 'Rollback');
        }).catch(err => {
            this.handleError(err);
        });
    }

    // 显示信息
    handleMsg(data, action) {
        // 提示成功或失败
        let msg = JSON.parse(data);
        // let msg = {error: '1', msg: '1111111'}
        if(msg.error === null) {
            notification.success({
                message: '成功！',
                description: `${action} Success!`,
            });
        }else {
            // 报错信息以html格式显示
            const description = (
                <div>
                    <p>{msg.msg}</p>
                </div>
            );
            notification.error({
                message: '失败！',
                description,
                duration: 0,
            });
        }
    }

    // 显示错误
    handleError(err) {
        let res = err.response;
        let errorMsg;
        let status;
        if(!res) {
            errorMsg = err.message;
            status = 500;
        }else {
            status = res.status;
            errorMsg = res.data;
            if (res.data.error) {
                errorMsg = res.data.error
            }
        }
        notification.error({
            message: '失败！',
            description: `${status}: ${errorMsg}`,
            duration: 0,
        });
    }

    render() {

        const { getFieldDecorator } = this.props.form;
        const { data, name, columns, podColumns, canaryVisible} = this.state;

        const modalContent = (
            <div>
                <AceEditor
                    mode="json"
                    theme="xcode"
                    onChange={onChange}
                    name="json"
                    fontSize={18}
                    width="450px"
                    height="600px"
                    editorProps={{$blockScrolling: true}}
                />
                <Button type="primary" className="create-job-button" onClick={this.handleABTestingSubmit.bind(this)}>
                    Submit
                </Button>
            </div>
        )

        let labels = [],
            annotations = [],
            match_labels = [],
            detailData = {
                created: '',
                history: '',
                rolling_update: {},
                status: {},
                strategy: '',
                min_ready_seconds: ''
            };

        if(data.length !== 0) {
            // 详情的数据
            detailData = {
                created: data.metadata.creation_timestamp,
                history: data.spec.revision_history_limit,
                rolling_update: data.spec.strategy.rolling_update,
                strategy: data.spec.strategy.type,
                min_ready_seconds: data.spec.min_ready_seconds === null ? '0' : data.spec.min_ready_seconds,
                status: data.status
            }

            // 标签样式
            for (let p in data.metadata.labels) {
                labels.push(<span style={spanStyle} key={p}>{p}: {data.metadata.labels[p]}</span>)
            }
            // 选择器样式
            for (let p in data.spec.selector.match_labels) {
                match_labels.push(<span style={spanStyle} key={p}>{p}: {data.spec.selector.match_labels[p]}</span>)
            }
            // 注释样式
            for (let p in data.metadata.annotations) {
                if(p !== 'app_specs_text') {
                    annotations.push(<span style={spanStyle} key={p}>{p}: {data.metadata.annotations[p]}</span>)
                }
            }
        }

        return (
            <div>
                <div className="detailPage">
                    <Collapse bordered={false} defaultActiveKey={['1']}>
                        <Panel header={<h2>详情</h2>} key="1">
                            <div className="detailLeft">
                                <p>名称：{name}</p>
                                <p>命名空间：{data.space ? data.space : 'default'}</p>
                                <p>Canary: {this.state.canaryVisible.toString()}</p>
                                <p>Config: <Button onClick={() => { this.setState({configmapVisible: true})}}>Set</Button>
                                   <Button onClick={this.showConfigMap.bind(this)}>Show</Button>
                                </p>
                                <p>Secret: <Button onClick={() => { this.setState({secretVisible: true})}}>Set</Button>
                                   <Button onClick={this.showSecret.bind(this)}>Show</Button>
                                </p>
                                {this.state.canaryVisible &&
                                <p>
                                    ABTesting Rules: <Button onClick={this.showABTestingRules.bind(this)}>Show</Button>
                                </p>
                                }
                                <p>标签： {labels}</p>
                                <p>注释： {annotations ? annotations : '无'}</p>
                                <p>创建时间： {detailData.created}</p>
                                <p>选择器： {match_labels}</p>
                                <p>策略： {detailData.strategy}</p>
                                <p>最小就绪秒数： {detailData.min_ready_seconds}</p>
                                <p>历史版本限制值： {detailData.history}</p>
                                <p>滚动更新策略： 最大激增数：{detailData.rolling_update.max_surge}，最大无效数：{detailData.rolling_update.max_unavailable}</p>
                                <p>状态： {detailData.status.updated_replicas}个已更新，共计 {detailData.status.ready_replicas}个， {detailData.status.available_replicas}个可用， {detailData.status.unavailable_replicas === null ? '0' : detailData.status.unavailable_replicas}个不可用</p>
                                <Button type="primary"><Link to={`/logger?app=${name}`}>查看日志</Link></Button>
                                <Button onClick={() => {this.setState({renewVisible: true})}}>Renew</Button>
                                <Button onClick={() => {this.setState({scaleVisible: true})}}>Scale</Button>
                                <Button onClick={() => {this.setState({rollbackVisible: true})}}>Rollback</Button>

                                {this.state.canaryVisible &&
                                <span>
                                    <Button onClick={() => {this.setState({deleteCanaryVisible: true})}}>DeleteCanary</Button>
                                    <Button onClick={() => {this.setState({abtestingVisible: true})}}>ABTesting</Button>
                                </span>}
                                <div>{this.state.example}</div>
                            </div>
                            { this.state.textVisible ? (
                                <div className="detailRight">
                                    <div className="title-bar"></div>
                                    <div className="text-body">
                                        <span className="text"></span>
                                    </div>
                                </div>
                            ) : ''}
                        </Panel>
                    </Collapse>

                    <div style={{ height: '40px' }}></div>

                    <Collapse bordered={false} defaultActiveKey={['1']}>
                        <Panel header={<h2>副本集</h2>} key="1">
                            <Table
                                columns={podColumns}
                                dataSource={this.state.podTableData}
                                rowKey="name"
                            />
                        </Panel>
                    </Collapse>

                    <div style={{ height: '40px' }}></div>

                    {this.state.canaryVisible && <Collapse bordered={false} defaultActiveKey={['1']}>
                        <Panel header={<h2>canary副本集</h2>} key="1">
                            <Table
                                columns={podColumns}
                                dataSource={this.state.canarypodTableData}
                                rowKey="name"
                            />
                        </Panel>
                    </Collapse>}

                    <div style={{ height: '40px' }}></div>

                    <Collapse bordered={false} defaultActiveKey={['1']}>
                        <Panel header={<h2>版本信息</h2>} key="1">
                            <Table
                                columns={columns}
                                dataSource={this.state.tableData}
                                rowKey="id"
                            />
                        </Panel>
                    </Collapse>

                    <Modal
                        title={this.state.infoModal.title}
                        visible={this.state.infoModal.visible}
                        onOk={this.hiddenInfoModal.bind(this)}
                        onCancel={this.hiddenInfoModal.bind(this)}
                        footer={[
                            <Button key="login" type="primary" onClick={this.hiddenInfoModal.bind(this)}>
                                确定
                            </Button>,
                        ]}
                    >
                        <div dangerouslySetInnerHTML={{__html: this.state.infoModal.text}}></div>
                    </Modal>

                    <Modal
                        title="伸缩 部署"
                        visible={this.state.scaleVisible}
                        onOk={this.handleScale.bind(this)}
                        onCancel={() => {this.setState({scaleVisible: false})}}
                    >
                        <span>所需容器数量：</span>
                        <InputNumber min={1} max={10} defaultValue={1} onChange={num => {this.setState({scaleNum: num})}} />
                    </Modal>

                    <Modal
                        title="更新"
                        visible={this.state.renewVisible}
                        onOk={this.handleRenew.bind(this)}
                        onCancel={() => {this.setState({renewVisible: false})}}
                    >
                        <p>Force kubernetes to recreate the pods of specified app!</p>
                    </Modal>

                    <Modal
                        title="回滚"
                        visible={this.state.rollbackVisible}
                        onOk={this.handleRollback.bind(this)}
                        onCancel={() => {this.setState({rollbackVisible: false})}}
                    >
                        <p>Rollback specified app!</p>
                    </Modal>

                    <Modal
                        title={this.state.deployModal.title}
                        visible={this.state.deployModal.visible}
                        onOk={this.handleDeploy.bind(this)}
                        onCancel={() => {
                              let deployModal = this.state.deployModal
                              deployModal.visible = false
                              this.setState({deployModal: deployModal})}}
                    >
                        <span>所需容器数量：</span>
                        <InputNumber min={0} max={100} defaultValue={0}
                           onChange={num => {
                              let deployModal = this.state.deployModal
                              deployModal.replicas = num
                              this.setState({deployModal: deployModal})}} />
                    </Modal>

                    <Modal
                        title="删除Canary"
                        visible={this.state.deleteCanaryVisible}
                        onOk={this.handleDeleteCanary.bind(this)}
                        onCancel={() => {this.setState({deleteCanaryVisible: false})}}
                    >
                        <p>Are you sure to delete canary version?</p>
                    </Modal>

                    <Modal
                        title="Set A/B Testing Rules"
                        visible={this.state.abtestingVisible}
                        onCancel={() => {this.setState({abtestingVisible: false})}}
                        footer={null}
                    >
                        {modalContent}
                    </Modal>

                    <Modal
                        title="构建"
                        visible={this.state.buildVisible}
                        onOk={this.handleBuild.bind(this)}
                        onCancel={() => {this.setState({buildVisible: false})}}
                    >
                        <p>Build an image for the specified release, the API will return all docker!</p>
                    </Modal>
                    <Modal
                        title="创建ConfigMap"
                        visible={this.state.configmapVisible}
                        onCancel={() => { this.setState({configmapVisible: false})}}
                        footer={null}
                    >
                        <Form style={{marginTop: '20px'}} onSubmit={this.handleConfigMap.bind(this)}>
                            <FormItem
                                {...formItemLayout}
                                label="File Name"
                            >
                                {getFieldDecorator('filename')(
                                    <Input placeholder="config file name"/>
                                )}
                            </FormItem>
                            <FormItem
                                {...formItemLayout}
                                label="Data"
                            >
                                {getFieldDecorator('data', {
                                    rules: [{required: true, message: 'Please input you config content'}]
                                })(
                                    <TextArea rows={4} />
                                )}
                            </FormItem>
                            <Button type="primary" htmlType="submit" className="create-job-button">
                                Submit
                            </Button>
                        </Form>
                    </Modal>

                    <Modal
                        title="创建Secret"
                        visible={this.state.secretVisible}
                        onCancel={() => { this.setState({secretVisible: false})}}
                        footer={null}
                    >
                        <SecretForm handler={this.handleSecret} />
                    </Modal>
                    <div id="example"></div>
                </div>
            </div>
        )
    }
}

class SecretForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {keys:[], values: [] };
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  createUI(){
     return this.state.values.map((el, i) =>
         <div key={i}>
           <Row>
             <Col span={8}>
              <FormItem>
                  <Input placeholder="key" value={this.state.keys[i]||''} onChange={this.handleKeyChange.bind(this, i)}/>
              </FormItem>
            </Col>
            <Col span={1}>
              <FormItem>
                <div> ： </div>
              </FormItem>
            </Col>
             <Col span={11}>
              <FormItem>
                  <Input placeholder="value" value={el||''} onChange={this.handleValChange.bind(this, i)}/>
              </FormItem>
            </Col>
            <Col span={2}>
              <Button icon="minus" shape="circle" onClick={this.removeClick.bind(this, i)}/>
            </Col>
    	  </Row>
         </div>
     )
  }

  handleValChange(i, event) {
     let values = [...this.state.values];
     values[i] = event.target.value;
     this.setState({ values });
  }

  handleKeyChange(i, event) {
     let keys = [...this.state.keys];
     keys[i] = event.target.value;
     this.setState({ keys });
  }

  addClick(){
    this.setState(prevState => ({ keys: [...prevState.keys, ''], values: [...prevState.values, '']}))
  }

  removeClick(i){
     let values = [...this.state.values];
     values.splice(i,1);
     let keys = [...this.state.keys]
     keys.splice(i, 1)
     this.setState({ values: values, keys: keys });
  }

  handleSubmit(event) {
    event.preventDefault();
    this.props.handler(this.state.keys, this.state.values)
  }

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
          {this.createUI()}
          <Row>
            <Button onClick={this.addClick.bind(this)} > + </Button>
          </Row>
          <Row>
            <FormItem>
              <Button type="primary" htmlType="submit" >
                Submit
              </Button>
            </FormItem>
          </Row>
      </form>
    );
  }
}

export default Form.create()(AppDetail);
