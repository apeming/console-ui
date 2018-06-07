import React from 'react';
import { Collapse, Table, Icon, Divider, Dropdown, Menu, Button, Modal, InputNumber } from 'antd';
import { Link } from 'react-router-dom'; 
import { getDetail, getPods, getReleases, appBuild, appScale, appRollback, appRenew } from 'api';
import Typed from 'typed.js';
import './index.css';
const Panel = Collapse.Panel;

const spanStyle = {
    padding: '0 4px',
    marginRight: '4px',
    background: '#eee',
    border: '1px solid #ccc',
    borderRadius: '6px'
}

const options = {
    strings: ["<i>First</i> sentence.", "&amp; a second sentence."],
    typeSpeed: 40,
}

class AppDetail extends React.Component {

    constructor() {
        super();
        let self = this;
        this.state = {
            text: '',
            example: '',
            name: '',
            scaleNum: 1,
            data: [],
            tableData: [],
            podTableData: [],
            visible: false,
            textVisible: false,
            scaleVisible: false,
            columns: [
                {
                    title: 'tag',
                    dataIndex: 'tag',
                    width: '10%',
                }, {
                    title: 'updated',
                    dataIndex: 'updated',
                    width: '15%',
                }, {
                    title: 'created',
                    dataIndex: 'created',
                    width: '15%',
                }, {
                    title: 'image',
                    dataIndex: 'image',
                    width: '30%',
                }, {
                    title: 'build_status',
                    dataIndex: 'build_status',
                    width: '20%',
                    render(build_status) {
                        return build_status + ''
                    }
                }, {
                    title: 'Action',
                    dataIndex: 'action',
                    render(text, record) {
                        const menu = (
                            <Menu>
                                {
                                    record.build_status ? '' : (
                                        <Menu.Item key="0">
                                            <div onClick={self.handleBuild.bind(self)}>构建</div>
                                        </Menu.Item>
                                    )
                                }
                                <Menu.Item key="1">
                                    <div onClick={() => {self.handleText(record.specs_text)}}>配置</div>
                                </Menu.Item>
                            </Menu>
                        );
            
                        return (
                            <Dropdown overlay={menu} trigger={['click']}>
                                <a className="ant-dropdown-link" href="#">
                                    <div style={{width: '20px'}}>
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
                    title: 'name',
                    dataIndex: 'name',
                    width: '30%'
                },
                {
                    title: 'status',
                    dataIndex: 'status',
                    align: 'center',
                    width: '30%',
                    render: status => {
                        if(status === 'Pending') {
                            return (
                                <Icon type="loading" style={{ color: 'red' }}/>
                            )
                        }else {
                            return (
                                <span>Running</span>
                            )
                        }
                    }
                },
                {
                    title: 'ready',
                    dataIndex: 'ready',
                    align: 'center',
                    width: '30%',
                    render: ready => {
                        if(ready) {
                            return (
                                <Icon type="check-circle" style={{ color: 'green' }}/>
                            )
                        }else {
                            return (
                                <Icon type="close-circle" style={{ color: 'red' }}/>
                            )
                        }
                    }
                }
            ]
        }
        this.handleMsg = this.handleMsg.bind(this);
    }

    componentDidMount() {
        const name = window.location.href.split('app=')[1];
        this.setState({
            name: name
        });

        getDetail(name).then(res => {
            this.setState({
                data: res
            })
        });

        getPods(name).then(res => {
            let arr = [];
            res.items.map(d => {
                let temp = {
                    name: d.metadata.name,
                    status: d.status.phase,
                    ready: d.status.container_statuses[0].ready + ''
                }
                arr.push(temp);
            })
            this.setState({
                podTableData: arr
            })
        });

        getReleases(name).then(res => {
            this.setState({
                tableData: res
            })
        });
    }
    
    // 关闭配置弹框
    handleCancel() {
        this.setState({
            visible: false,
        });
    }

    // 构建
    handleBuild() {
        let name = this.state.name;
        let data;
        appBuild({name: name, tag: 'v0.0.2'}).then(res => {
            this.handleMsg(res.replace(/,/g, '<br/>'));
        });
    }

    // 打开配置弹框
    handleText(data) {
        let text = data.replace(/\n/g, '<br/>');
        text = text.replace(/ /g, '&nbsp;&nbsp;');
        this.setState({ 
            text: text,
            visible: true
        });
    }

    // 更新
    handleRenew() {
        let name = this.state.name
        let data;
        appRenew({name: name}).then(res => {
            this.handleMsg(res);
        });
    }

    // 伸缩
    handleScale() {
        this.setState({scaleVisible: false})
        let name = this.state.name,
            num = this.state.scaleNum;
        let data;
        appScale({name: name, replicas: num}).then(res => {
            // this.handleMsg(res.replace(/,/g, '<br/>'));
        });
    }

    // 回滚
    handleRollback() {
        let name = this.state.name
        let data;
        appRollback({name: name}).then(res => {
            this.handleMsg(res);
        });
    }

    // 显示信息
    handleMsg(data) {
        this.setState({
            textVisible: true
        })
        var typed = new Typed('.text', {
            strings: [data],
            typeSpeed: 40,
            onComplete: () => {
                setTimeout(() => {
                    this.setState({
                        textVisible: false
                    })
                    location.reload();
                }, 2000);
            }
        });
    }


    render() {
        const { data, name, columns, podColumns } = this.state;

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
            <div className="detailPage">
                <h1><strong>{name}</strong>:详情页面</h1>
                <Collapse bordered={false} defaultActiveKey={['1']}>
                    <Panel header={<h2>详情</h2>} key="1">
                        <div className="detailLeft">
                            <p>名称：{name}</p>
                            <p>命名空间：{data.space ? data.space : 'default'}</p>
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
                            <Button onClick={this.handleRenew.bind(this)}>更新</Button>
                            <Button onClick={() => {this.setState({scaleVisible: true})}}>伸缩</Button>
                            <Button onClick={this.handleRollback.bind(this)}>回滚</Button>
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
                    title="配置信息"
                    visible={this.state.visible}
                    onOk={this.handleCancel.bind(this)}
                    onCancel={this.handleCancel.bind(this)}
                    footer={[
                        <Button key="back" onClick={this.handleCancel.bind(this)}>取消</Button>,
                        <Button key="login" type="primary" onClick={this.handleCancel.bind(this)}>
                            确定
                        </Button>,
                    ]}
                >
                    <div dangerouslySetInnerHTML={{__html: this.state.text}}></div>
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
            </div>
        )
    }
}

export default AppDetail;