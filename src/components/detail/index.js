import React from 'react';
import ReactDOM from 'react-dom';

import {Icon, Divider, Collapse, Table, Button, Modal, Row, Col, Select, Form, Input, InputNumber, Menu, Dropdown, Checkbox, notification } from 'antd';
import { Link } from 'react-router-dom';
import {
    getDeployment, getAppCanaryInfo, getReleases, appDeploy, appDeployCanary,
    appDeleteCanary, appSetABTestingRules, appGetABTestingRules, appScale, appRollback,
    appRenew, getCluster, appPostConfigMap, appGetConfigMap, appPostSecret, appGetSecret,
    appPostReleaseSpec } from 'api';
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
const confirm = Modal.confirm;

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

function getInitialState() {
    return {
        detailData: {
            namespace: '',
            created: '',
            history: '',
            rolling_update: {},
            status: {},
            strategy: '',
            min_ready_seconds: '',
            annotations: [],
            labels: [],
            match_labels: []
        },
        infoModal: {
            text: '',
            title: '',
            visible: false
        },
        deployModal: {
            title: '',
            visible: false,
            replicas: -1,
            tag: '',
            canary: false
        },
        configMapData: null,
        secretData: null,
        example: '',
        name: '',
        nowTag: '',
        replicas: 1,
        version: '',
        nowCluster: '',
        scaleNum: 1,
        rollbackRevisionNum: 0,
        releaseTableData: [],
        podTableData: [],
        canarypodTableData: [],
        textVisible: false,
        scaleVisible: false,
        rollbackVisible: false,
        canaryVisible: false
    }
}

class AppDetail extends React.Component {

    constructor() {
        super();

        let self = this;
        this.state = getInitialState()
        this.handleMsg = this.handleMsg.bind(this);
        this.showAceEditorModal = this.showAceEditorModal.bind(this)
        this.fetchDeploymentData = this.fetchDeploymentData.bind(this)
    }

    componentDidMount() {
        let that = this;

        // 获取APP name
        const name = getArg('app')
        const defaultCluster = getArg('cluster');

        // 测试地址
        const testUrl = process.env.NODE_ENV === 'production' ? '' : 'http://192.168.1.17:5000';

        if(!defaultCluster) {
            getCluster().then(res => {
                fetchAllData(name, res[0]);
            })
        }else {
            fetchAllData(name, defaultCluster);
        }

        that.eventEmitter = emitter.addListener("clusterChange", (cluster)=>{
            fetchAllData(name, cluster);
        });

        function fetchAllData(name, cluster) {
            that.setState(getInitialState())

            that.setState({
                name: name,
                nowCluster: cluster
            })

            getReleases(name).then(res => {
                that.setState({
                    releaseTableData: res
                })
            });

            getAppCanaryInfo({name:name, cluster:cluster}).then(res => {
                that.setState({
                    canaryVisible: res.status
                })
            })
            that.fetchDeploymentData(name, cluster)
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

    componentWillMount() {
    }

    fetchDeploymentData(name, cluster) {
        getDeployment({name: name, cluster: cluster}).then(res => {
            let deployment = res
            let labels = [],
                annotations = [],
                match_labels = []

            // 详情的数据
            let detailData = {
                namespace: deployment.metadata.namespace,
                created: deployment.metadata.creation_timestamp,
                history: deployment.spec.revision_history_limit,
                rolling_update: deployment.spec.strategy.rolling_update,
                strategy: deployment.spec.strategy.type,
                min_ready_seconds: deployment.spec.min_ready_seconds === null ? '0' : deployment.spec.min_ready_seconds,
                status: deployment.status
            }

            // 标签样式
            for (let p in deployment.metadata.labels) {
                labels.push(<span style={spanStyle} key={p}>{p}: {deployment.metadata.labels[p]}</span>)
            }
            // 选择器样式
            for (let p in deployment.spec.selector.match_labels) {
                match_labels.push(<span style={spanStyle} key={p}>{p}: {deployment.spec.selector.match_labels[p]}</span>)
            }
            // 注释样式
            for (let p in deployment.metadata.annotations) {
                if(p !== 'app_specs_text') {
                    annotations.push(<span style={spanStyle} key={p}>{p}: {deployment.metadata.annotations[p]}</span>)
                }
            }
            detailData.annotations = annotations
            detailData.labels = labels
            detailData.match_labels = match_labels

            this.setState({
                detailData: detailData,
                version: res.metadata.annotations.release_tag
            })
        }).catch(err => {
            let resp = err.response;
            if (resp.status !== 404) {
                this.handleError(err);
            }
        });
    }

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

    hiddenInfoModal() {
        this.setState({
            infoModal: {
                visible: false,
            }
        });
    }

    showAceEditorModal(config) {
        let self = this

        let div = document.createElement('div');
        document.body.appendChild(div);

        function destroy(...args: any[]) {
          const unmountResult = ReactDOM.unmountComponentAtNode(div);
          if (unmountResult && div.parentNode) {
            div.parentNode.removeChild(div);
          }
        }

        ReactDOM.render(<AceEditorModal config={config} destroy={destroy} />, div)
    }

    updateReleaseSpec(spec, destroy) {
        let {name, nowTag} = this.state
        let data = {
            specs_text: spec
        }
        appPostReleaseSpec(name, nowTag, data).then(res=> {
            destroy()
            this.handleMsg(res, "Update Release Spec")
            // update release data
            getReleases(name).then(res => {
                this.setState({
                    releaseTableData: res
                })
            });
        }).catch(err => {
            this.handleError(err)
        })
    }
    // 构建
    handleBuild(tag) {
        let self = this
        let { name } = self.state;

        confirm({
            title: 'Build',
            content: `Are you sure to build image for app ${name} release ${tag}?`,
            onOk() {
                let infoModal = self.state.infoModal
                infoModal.visible = true
                infoModal.title = "Build Output"
                self.setState({infoModal: infoModal})

                let prodSchema = "ws:"
                if (window.location.protocol === "https:") {
                    prodSchema = "wss:"
                }
                const wsUrl = process.env.NODE_ENV === 'production' ? prodSchema + '//'+window.location.host : 'ws://192.168.1.17:5000';
                const ws = new WebSocket(`${wsUrl}/api/v1/ws/app/${name}/build`);
                ws.onopen = function(evt) {
                    ws.send(`{"tag": "${tag}"}`);
                };
                ws.onclose = function(evt) {
                    // update release data
                    getReleases(name).then(res => {
                        self.setState({
                            releaseTableData: res
                        })
                    });
                    console.log("Build finished")
                }

                let text = ""
                let phase = null
                ws.onmessage = function(evt) {
                    let data = JSON.parse(evt.data);
                    if (! data.success) {
                        text += `<p key=${data.error}>${data.error}</p>`
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
            },
            onCancel() {},
        });
    }

    showConfigMap() {
        const {name, nowCluster} = this.state

        appGetConfigMap(name, {cluster: nowCluster}).then(res => {
            this.setState({configMapData: res})
            this.showInfoModal("ConfigMap", res)
        }).catch(err => {
            this.handleError(err);
        });
    }

    handleConfigMap() {
        let self = this
        let { name, nowCluster } = this.state;

        function createConfigMap(configMapData) {
            let div = document.createElement('div');
            document.body.appendChild(div);

            function destroy(...args: any[]) {
              const unmountResult = ReactDOM.unmountComponentAtNode(div);
              if (unmountResult && div.parentNode) {
                div.parentNode.removeChild(div);
              }
            }

            function submitForm(params) {
                params.cluster = nowCluster
                console.log(params)

                appPostConfigMap(name, params).then(res=> {
                    destroy()
                    self.handleMsg(res, "Create ConfigMap")
                }).catch(err => {
                    self.handleError(err)
                })
            }
            let config = {
                initialValue: configMapData,
                handler: submitForm
            }

            const WrappedConfigMapModal = Form.create()(ConfigMapModal);

            ReactDOM.render(<WrappedConfigMapModal config={config} destroy={destroy} />, div)
        }

        // we need initial value of form, so if configMapData is null, we need to get it from backend
        if (self.state.configMapData === null) {
            appGetConfigMap(name, {cluster: nowCluster}).then(res => {
                self.setState({configMapData: res})
                createConfigMap(res)
            }).catch(err => {
                let res = {}
                self.setState({configMapData: res})
                createConfigMap(res)
            });
        } else {
            createConfigMap(self.state.configMapData)
        }
    }

    showSecret() {
        const {name, nowCluster} = this.state

        appGetSecret(name, {cluster: nowCluster}).then(res => {
            this.setState({secretData: res})
            this.showInfoModal("Secret", res)
        }).catch(err => {
            this.handleError(err);
        });
    }

    handleSecret() {
        let self = this

        function createSecret(secretData){
            let div = document.createElement('div');
            document.body.appendChild(div);

            function destroy(...args: any[]) {
              const unmountResult = ReactDOM.unmountComponentAtNode(div);
              if (unmountResult && div.parentNode) {
                div.parentNode.removeChild(div);
              }
            }

            function submitForm(data) {
                let { name, nowCluster } = self.state;
                let params = {data: data, cluster: nowCluster}
                appPostSecret(name, params).then(res=> {
                    self.handleMsg(res, "Create Secret")
                    destroy()
                }).catch(err => {
                    self.handleError(err)
                })
            }

            ReactDOM.render(<SecretFormModal value={secretData} handler={submitForm} destroy={destroy} />, div)
        }

        // we need initial value of form, so if secretData is null, we need to get it from backend
        if (self.state.secretData === null) {
            const {name, nowCluster} = self.state

            appGetSecret(name, {cluster: nowCluster}).then(res => {
                self.setState({secretData: res})
                createSecret(res)
            }).catch(err => {
                let res = {}
                self.setState({secretData: res})
                createSecret(res)
            });
        } else {
            createSecret(self.state.secretData)
        }
    }

    // 部署
    handleDeploy() {
        let deployModal = this.state.deployModal
        deployModal.visible = false
        this.setState({deployModal: deployModal})
        let { name, nowCluster } = this.state;
        let tag = deployModal.tag

        let data = {tag: tag, cluster: nowCluster}
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
                // update version
                this.fetchDeploymentData(name, nowCluster)
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
        let { name, nowCluster } = this.state;
        let replicas = deployModal.replicas
        let tag = deployModal.tag

        let data = {name: name, tag: tag, cluster: nowCluster}
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
        let self = this

        confirm({
            title: 'Delete Canary',
            content: 'Are you sure to delete canary version?',
            onOk() {
                let { name, nowCluster } = self.state;
                appDeleteCanary({name: name, cluster: nowCluster}).then(res => {
                    self.setState({canaryVisible: false})
                    self.handleMsg(res, 'Delete Canary');
                }).catch(err => {
                    self.handleError(err);
                });
            },
            onCancel() {},
        });
    }

    handleSetABTestingRules() {
        let self = this
        const {name, nowCluster} = this.state

        function handleABTestingSubmit(abtestingRulesValue, destroy) {
            appSetABTestingRules({
                name: name,
                cluster: nowCluster,
                rules: JSON.parse(abtestingRulesValue)
            }).then(res => {
                destroy()
                self.handleMsg(res, 'SET ABTesting Rules');
            }).catch(err => {
                self.handleError(err);
            });
        }

        function setRulesHelper(initialValue) {
            let config = {
                title: "Set A/B Testing Rules",
                mode: "json",
                initialValue: initialValue,
                handler: handleABTestingSubmit
            }
            self.showAceEditorModal(config)
        }

        appGetABTestingRules({
            name: name,
            cluster: nowCluster
        }).then(res => {
            let str = ""
            if (res) {
                str = JSON.stringify(res, null, 2)
            }
            setRulesHelper(str)
        }).catch(err => {
            let res = ""
            setRulesHelper(res)
        });
    }

    // 更新
    handleRenew() {
        let self = this

        confirm({
            title: 'Recreate Pods',
            content: `Are you sure to force kubernetes to recreate the pods of ${self.state.name} app?`,
            onOk() {
                let {name, nowCluster} = self.state;
                appRenew({name: name, cluster: nowCluster}).then(res => {
                    self.handleMsg(res, 'Renew');
                }).catch(err => {
                    self.handleError(err);
                });
            },
            onCancel() {},
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
        let {name, nowCluster, rollbackRevisionNum} = this.state
        appRollback(name, {cluster: nowCluster, revision: rollbackRevisionNum}).then(res => {
            this.handleMsg(res, 'Rollback');
            this.fetchDeploymentData(name, nowCluster)
        }).catch(err => {
            this.handleError(err);
        });
    }

    // 显示信息
    handleMsg(data, action) {
        // 提示成功或失败
        let msg = JSON.parse(data);
        // let msg = {error: '1', msg: '1111111'}
        notification.destroy()

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
        // destroy existing notifications first
        notification.destroy()

        notification.error({
            message: '失败！',
            description: `${status}: ${errorMsg}`,
            duration: 0,
        });
    }

    render() {

        let self = this
        const {name, canaryVisible} = this.state;
        let podColumns = [
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

        let releaseColumns = [
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
                                        <div onClick={() => {
                                                  self.handleBuild.bind(self)(record.tag)}}>Build</div>
                                    </Menu.Item>
                                )
                            }
                            <Menu.Item key="1">
                                <div onClick={() => {
                                    let deployModal = self.state.deployModal
                                    deployModal.visible = true
                                    deployModal.title = `Deploy ${self.state.name} (tag: ${record.tag}, cluster: ${self.state.nowCluster})`
                                    deployModal.canary = false
                                    deployModal.tag = record.tag
                                    self.setState({deployModal: deployModal})
                                    }}>Deploy</div>
                            </Menu.Item>
                            <Menu.Item key="2">
                                <div onClick={() => {
                                    let deployModal = self.state.deployModal
                                    deployModal.visible = true
                                    deployModal.title = `DeployCanary ${self.state.name} (tag: ${record.tag}, cluster: ${self.state.nowCluster})`
                                    deployModal.canary = true
                                    deployModal.tag = record.tag
                                    self.setState({deployModal: deployModal})}}>Canary</div>
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item key="3">
                                <div onClick={() => {
                                    let config = {
                                        title: "Spec",
                                        mode: "yaml",
                                        visible: true,
                                        initialValue: record.specs_text,
                                        handler: self.updateReleaseSpec.bind(self)
                                    }
                                    self.setState({nowTag: record.tag})
                                    self.showAceEditorModal(config) }} >Spec Text</div>
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
        ]

        return (
            <div>
                <div className="detailPage">
                    <Collapse bordered={false} defaultActiveKey={['1']}>
                        <Panel header={<h2>详情</h2>} key="1">
                            <div className="detailLeft">
                                <p>名称：{name}</p>
                                <p>集群：<span style={{color: 'blue'}}>{this.state.nowCluster}</span></p>
                                <p>命名空间：{this.state.detailData.namespace}</p>
                                <div>Canary: <span style={{color: 'blue'}}>{this.state.canaryVisible.toString()}</span><strong></strong>
                                    {this.state.canaryVisible &&
                                        <span>
                                          <Divider type="vertical" />
                                          <Button onClick={this.handleDeleteCanary.bind(this)}>DeleteCanary</Button>
                                        </span>
                                    }
                                </div>
                                <p>Config: <Button onClick={this.handleConfigMap.bind(this)}>Set</Button>
                                   <Button onClick={this.showConfigMap.bind(this)}>Show</Button>
                                </p>
                                <p>Secret: <Button onClick={this.handleSecret.bind(this)}>Set</Button>
                                   <Button onClick={this.showSecret.bind(this)}>Show</Button>
                                </p>
                                {this.state.canaryVisible &&
                                <p>
                                    ABTesting Rules: <Button onClick={this.handleSetABTestingRules.bind(this) }>Set</Button>
                                </p>
                                }
                                <p>标签： {this.state.detailData.labels}</p>
                                <p>注释： {this.state.detailData.annotations ? this.state.detailData.annotations : '无'}</p>
                                <p>创建时间： {this.state.detailData.created}</p>
                                <p>选择器： {this.state.detailData.match_labels}</p>
                                <p>策略： {this.state.detailData.strategy}</p>
                                <p>最小就绪秒数： {this.state.detailData.min_ready_seconds}</p>
                                <p>历史版本限制值： {this.state.detailData.history}</p>
                                <p>滚动更新策略： 最大激增数：{this.state.detailData.rolling_update.max_surge}，
                                   最大无效数：{this.state.detailData.rolling_update.max_unavailable}</p>
                                <p>状态： {this.state.detailData.status.updated_replicas}个已更新，共计 {this.state.detailData.status.ready_replicas}个， {this.state.detailData.status.available_replicas}个可用， {this.state.detailData.status.unavailable_replicas === null ? '0' : this.state.detailData.status.unavailable_replicas}个不可用</p>
                                <Button type="primary"><Link to={`/logger?app=${name}`}>查看日志</Link></Button>
                                <Button onClick={this.handleRenew.bind(this)}>Renew</Button>
                                <Button onClick={() => {this.setState({scaleVisible: true})}}>Scale</Button>
                                <Button onClick={() => {this.setState({rollbackVisible: true})}}>Rollback</Button>

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
                                columns={releaseColumns}
                                dataSource={this.state.releaseTableData}
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
                        title={`Scale ${this.state.name} (cluster: ${this.state.nowCluster})`}
                        visible={this.state.scaleVisible}
                        onOk={this.handleScale.bind(this)}
                        onCancel={() => {this.setState({scaleVisible: false})}}
                    >
                        <span>所需容器数量：</span>
                        <InputNumber min={1} max={10} defaultValue={1} onChange={num => {this.setState({scaleNum: num})}} />
                    </Modal>

                    <Modal
                        title={`Rollback ${this.state.name} (cluster: ${this.state.nowCluster})`}
                        visible={this.state.rollbackVisible}
                        onOk={this.handleRollback.bind(this)}
                        onCancel={() => {this.setState({rollbackVisible: false})}}
                    >
                        <span>revision：</span>
                        <InputNumber min={0} max={10} defaultValue={0} onChange={num => {this.setState({rollbackRevisionNum: num})}} />
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

                    <div id="example"></div>
                </div>
            </div>
        )
    }
}

class AceEditorModal extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
        visible: true,
        value: this.props.config.initialValue,
        config: this.props.config,
        destroy: this.props.destroy
    };
    this.handleSubmit = this.handleSubmit.bind(this);
    this.onChange = this.onChange.bind(this);
  }

  onChange(newValue) {
      this.setState({value: newValue})
  }

  handleSubmit(event) {
    event.preventDefault();
    this.state.config.handler(this.state.value, this.state.destroy)
  }

  render() {

    return (
        <Modal
            title={this.state.config.title}
            visible={this.state.visible}
            onCancel={this.state.destroy}
            footer={null}
        >
      <form onSubmit={this.handleSubmit}>
            <AceEditor
                mode={this.state.config.mode}
                value={this.state.value}
                theme="xcode"
                onChange={this.onChange}
                name="json"
                fontSize={18}
                width="450px"
                height="600px"
                editorProps={{$blockScrolling: true}}
            />
          <Row>
            <FormItem>
              <Button type="primary" htmlType="submit" >
                Submit
              </Button>
            </FormItem>
          </Row>
      </form>
        </Modal>
    );
  }
}

class ConfigMapModal extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
        visible: true,
        config: this.props.config,
        initialValue: this.props.config.initialValue,
        destroy: this.props.destroy
    };
    this.handleSubmit = this.handleSubmit.bind(this);
    this.onChange = this.onChange.bind(this);
  }

  onChange(newValue) {
      this.setState({value: newValue})
  }

  handleSubmit(event) {
    event.preventDefault();
    this.props.form.validateFields((err, values) => {
        if (!err) {
            this.state.config.handler(values)
        }
    })
  }

  render() {
    const { getFieldDecorator } = this.props.form;

    return (
        <Modal
            title="创建ConfigMap"
            visible={this.state.visible}
            onCancel={this.state.destroy}
            footer={null}
        >
            <Form style={{marginTop: '20px'}} onSubmit={this.handleSubmit.bind(this)}>
                <FormItem
                    {...formItemLayout}
                    label="File Name"
                >
                    {getFieldDecorator('config_name', {
                        initialValue: this.state.initialValue.config_name
                    })(
                        <Input placeholder="config file name" />
                    )}
                </FormItem>
                <FormItem
                    {...formItemLayout}
                    label="Data"
                >
                    {getFieldDecorator('data', {
                        initialValue: this.state.initialValue.data,
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
    );
  }
}

class SecretFormModal extends React.Component {
  constructor(props) {
    super(props);
    let keys = []
    let values = []

    console.log(Object.entries(this.props.value))
    for (const [k, v] of Object.entries(this.props.value)) {
        keys.push(k)
        values.push(v)
    }
    this.state = {
        keys:keys,
        values: values,
        visible: true,
        destroy: this.props.destroy
    };
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

    let data = {}
    for (const [idx, key] of this.state.keys.entries()) {
        let val = this.state.values[idx]

        if ((! key) || (! val)) {
            continue
        }
        data[key] = val
    }
    this.props.handler(data)
  }

  render() {
    return (
    <Modal
        title="创建Secret"
        visible={this.state.visible}
        onCancel={this.state.destroy}
        footer={null}
    >
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

    </Modal>
    );
  }
}

export default Form.create()(AppDetail);
