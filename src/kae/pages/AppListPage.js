import React from 'react';
import { withRouter } from 'react-router-dom';
import {Collapse, Table, Input, Button, Icon } from 'antd';

import { getRequestFromProps } from '../models/Utils';
import * as AppActions from '../models/actions/Apps';
import {showRegisterAppModal} from "../components/RegisterAppModal";
const Panel = Collapse.Panel;

class AppList extends React.Component {
  constructor() {
    super();
    this.state = {
      searchText: ''
    };
  }

  componentDidMount() {
    this.refreshList();
  }

  refreshList() {
    const {dispatch} = this.props;
    dispatch(AppActions.list());
  }
  handleSearch(selectedKeys, confirm) {
    return () => {
      confirm();
      this.setState({ searchText: selectedKeys[0] });
    };

  }
  handleReset(clearFilters){
    return () => {
      clearFilters();
      this.setState({ searchText: '' });
    };
  }

  render() {
    const columns = [
      {
        title: 'name',
        dataIndex: 'name',
        filterDropdown: ({
          setSelectedKeys, selectedKeys, confirm, clearFilters,
        }) => (
          <div className="custom-filter-dropdown">
            <Input
              ref={ele => this.searchInput = ele}
              placeholder="Search name"
              value={selectedKeys[0]}
              onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={this.handleSearch(selectedKeys, confirm)}
            />
            <Button type="primary" onClick={this.handleSearch(selectedKeys, confirm)}>Search</Button>
            <Button onClick={this.handleReset(clearFilters)}>Reset</Button>
          </div>
        ),
        filterIcon: filtered => <Icon type="search" style={{ color: filtered ? '#108ee9' : '#aaa' }} />,
        onFilter: (value, record) => record.name.toLowerCase().includes(value.toLowerCase()),
        onFilterDropdownVisibleChange: (visible) => {
          if (visible) {
            setTimeout(() => {
              this.searchInput.focus();
            });
          }
        },
        render: (text) => {
          const { searchText } = this.state;
          return searchText ? (
            <span>
              {text.split(new RegExp(`(${searchText})`, 'gi')).map((fragment, i) => (
                fragment.toLowerCase() === searchText.toLowerCase()
                  ? <span key={i} className="highlight">{fragment}</span> : fragment // eslint-disable-line
              ))}
            </span>
          ) : text;
        },
      }, {
        title: 'Git',
        dataIndex: 'git'
      }, {
        title: 'Type',
        dataIndex: 'type'
      }, {
        title: 'created',
        dataIndex: 'created',
        defaultSortOrder: 'descend',
        sorter: (a, b) => {
          let c = new Date(a.created).getTime();
          let d = new Date(b.created).getTime();
          return c - d;
        }
      }, {
        title: 'Updated',
        dataIndex: 'updated'
      }
    ];

    const request = getRequestFromProps(this.props, 'LIST_APP_REQUEST');
    let data = [];
    if (request.statusCode === 200) {
      data = request.data;
    }
    return (
      <div className="appList">
        <Collapse bordered={false} defaultActiveKey={['1']}>
          <Panel header={<h2>应用列表</h2>} key="1">
            <div className="table-operations">
              <Button type="primary" onClick={showRegisterAppModal}>Add</Button>
            </div>
            <Table
              columns={columns}
              dataSource={data}
              size='small'
              rowKey="name"
              pagination={{ pageSize: 15 }}
              onRow={(record) => {
                return {
                  onClick: () => {
                    this.props.history.push(`/apps/${record.name}/detail`);
                  }
                };
              }}
            />
          </Panel>
        </Collapse>
      </div>
        );
    }
}

export default withRouter(AppList);
