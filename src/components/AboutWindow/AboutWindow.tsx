import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Typography, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import { tl } from '../../i18n';
import { GitHubIcon, BilibiliIcon, GamepadIcon, LightbulbIcon } from '../icons';
import { useEscapeKey } from '../../hooks';
import { OnboardingWizard } from '../OnboardingWizard/OnboardingWizard';
import './AboutWindow.css';

const { Title, Paragraph, Text } = Typography;

interface AboutWindowProps {
  onClose: () => void;
}

/**
 * 关于软件窗口组件
 * 显示软件信息、技术栈、功能说明等
 */
export const AboutWindow: React.FC<AboutWindowProps> = ({ onClose }) => {
  useTranslation();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ESC键返回
  useEscapeKey(() => {
    // 如果有弹窗打开，先关闭弹窗
    if (showOnboarding) {
      setShowOnboarding(false);
    } else {
      // 否则关闭关于窗口
      onClose();
    }
  });

  return (
    <div className="about-window">
      {/* 顶部拖拽区域 */}
      <div className="about-window-drag-area" data-tauri-drag-region />

      <motion.div
        className="about-window-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <Title level={2} className="about-title">
            {tl('关于 MCTier', 'About MCTier')}
          </Title>
        </motion.div>

        <motion.div
          className="about-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('软件简介', 'Overview')}
            </Title>
            <Paragraph className="section-text">
              {tl(
                'MCTier 是一个把不同网络环境下的设备组到同一个虚拟局域网里的工具，支持各类可以局域网联机的游戏。它基于 EasyTier 和 WebRTC 实现，电脑和已安装 MCTier 的设备都能加入同一个大厅。除了联机游戏，还可以访问对方机器上本地开的网页服务；语音、聊天、文件共享和屏幕共享都是自带的，不用自己搭服务器。',
                "MCTier groups devices from different networks into one virtual LAN, and works with any game that supports LAN multiplayer. Built on EasyTier and WebRTC, PCs and devices running MCTier can join the same lobby. Besides gaming, you can also reach services running on someone else's machine. Voice, chat, file sharing and screen sharing are all built in — no server setup required."
              )}
            </Paragraph>
            <div className="game-scope-tip">
              <GamepadIcon size={24} className="game-scope-icon" />
              <Text className="game-scope-text">
                {tl(
                  '适用于任何支持局域网联机的游戏，不仅仅只有 Minecraft',
                  'Works with any game that supports LAN multiplayer, not just Minecraft'
                )}
              </Text>
            </div>
            <div className="lan-access-tip">
              <Text className="lan-access-text">
                {tl(
                  '同一大厅内的玩家可以互相访问本地开放的网站和服务（如本地Web服务器、文件共享等）',
                  "Players in the same lobby can access each other's local sites and services (local web servers, file shares, etc.)"
                )}
              </Text>
            </div>
            <Button
              type="default"
              size="middle"
              block
              onClick={() => setShowOnboarding(true)}
              className="onboarding-entry-button"
              icon={<LightbulbIcon size={16} />}
            >
              {tl('查看新手引导', 'View Getting Started')}
            </Button>
          </div>

          <Divider className="about-divider" />

          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('核心技术', 'Core Technology')}
            </Title>
            <div className="tech-list">
              <div className="tech-item">
                <div>
                  <Text strong>{tl('EasyTier 虚拟网络', 'EasyTier Virtual Network')}</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '用 P2P 组一个虚拟局域网，跨网络也能直连',
                      'P2P-based virtual LAN, direct connections across networks'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>{tl('WebRTC 语音通信', 'WebRTC Voice')}</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '实时语音，延迟低，打游戏时说话不卡',
                      'Real-time voice with low latency for smooth in-game chat'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>HTTP over WireGuard</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '虚拟网络里的聊天和文件传输都走它',
                      'Carries chat and file transfer inside the virtual network'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>{tl('WebRTC 屏幕共享', 'WebRTC Screen Sharing')}</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '把屏幕实时共享出去，队友能看到你的画面',
                      'Share your screen live so teammates can see it'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>Tauri + React</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '桌面外壳用 Tauri，体积小、启动快',
                      'Built with Tauri, so the app is small and starts fast'
                    )}
                  </Paragraph>
                </div>
              </div>
            </div>
          </div>

          <Divider className="about-divider" />

          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('主要功能', 'Key Features')}
            </Title>
            <ul className="feature-list">
              <li>
                {tl(
                  '虚拟局域网组网 - 基于 EasyTier 的 P2P 组网',
                  'Virtual LAN - EasyTier-based P2P networking'
                )}
              </li>
              <li>
                {tl(
                  '实时语音 - 低延迟，支持快捷键开关',
                  'Voice - low-latency, controllable with hotkeys'
                )}
              </li>
              <li>
                {tl(
                  '聊天室 - 文本和图片消息，走虚拟网络',
                  'Chat - text and images over the virtual network'
                )}
              </li>
              <li>
                {tl(
                  '文件夹共享 - HTTP 文件服务器，支持批量下载和压缩',
                  'Folder sharing - HTTP file server with batch download and compression'
                )}
              </li>
              <li>
                {tl(
                  '屏幕共享 - 实时共享，可设置访问密码',
                  'Screen sharing - live, with optional password'
                )}
              </li>
              <li>
                {tl(
                  '多节点 - 可配多个 EasyTier 节点，节点挂了自动切换',
                  'Multi-node - several EasyTier nodes with automatic failover'
                )}
              </li>
              <li>
                {tl(
                  '悬浮窗 - 打游戏时不挡视野，可调透明度和音量',
                  'Overlay - stays out of the way in-game, adjustable opacity and volume'
                )}
              </li>
              <li>
                {tl(
                  '大厅隔离 - 不同大厅互不相通，各玩各的不串线',
                  'Lobby isolation - lobbies stay separate for privacy'
                )}
              </li>
              <li>
                {tl(
                  '开机自启 - 启动时自动创建/加入大厅',
                  'Auto-start - create or join a lobby on launch'
                )}
              </li>
              <li>
                {tl(
                  '虚拟域名 - Magic DNS，用域名代替 IP',
                  'Virtual domains - Magic DNS, names instead of IPs'
                )}
              </li>
              <li>
                {tl(
                  '私有化部署 - 可以自建节点和信令服务器',
                  'Self-hosting - run your own nodes and signaling server'
                )}
              </li>
            </ul>
          </div>

          <Divider className="about-divider" />

          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('开发者：Tnt-next', 'Developer: Tnt-next')}
            </Title>
            <div className="developer-info">
              <Paragraph className="project-info">
                {tl(
                  '本版本基于 MCTier 二次开发，界面重构为微信风格明暗主题。',
                  'This version is a fork of MCTier with a WeChat-style light/dark UI.'
                )}
              </Paragraph>
              <div className="repo-links">
                <a
                  href="https://space.bilibili.com/3546659195718047"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="repo-link"
                >
                  <BilibiliIcon size={16} />
                  <span>{tl('B站主页', 'Bilibili')}</span>
                </a>
                <a
                  href="https://github.com/TNTnext/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="repo-link"
                >
                  <GitHubIcon size={16} />
                  <span>{tl('GitHub', 'GitHub')}</span>
                </a>
              </div>
            </div>
          </div>

          <Divider className="about-divider" />

          <div className="about-section license-section">
            <Title level={4} className="section-title">
              {tl('开源协议', 'License')}
            </Title>
            <div className="license-content">
              <Paragraph className="license-text">
                {tl(
                  '本软件采用自定义开源协议，使用前请仔细阅读：',
                  'This software uses a custom open-source license. Please read carefully before use:'
                )}
              </Paragraph>
              <ul className="license-list">
                <li className="license-item">
                  <span className="license-icon">✗</span>
                  <Text className="license-desc">
                    {tl(
                      '禁止商业用途 - 本软件仅供个人学习和非商业使用',
                      'No commercial use - for personal learning and non-commercial use only'
                    )}
                  </Text>
                </li>
                <li className="license-item">
                  <span className="license-icon">✓</span>
                  <Text className="license-desc">
                    {tl(
                      '允许二次开发 - 欢迎基于本项目进行修改和扩展',
                      'Modification allowed - feel free to modify and extend this project'
                    )}
                  </Text>
                </li>
                <li className="license-item">
                  <span className="license-icon">✎</span>
                  <Text className="license-desc">
                    {tl(
                      '必须标明原作者 - 二次开发项目需注明原作者信息',
                      'Attribution required - derivative projects must credit the original author'
                    )}
                  </Text>
                </li>
                <li className="license-item">
                  <span className="license-icon">✓</span>
                  <Text className="license-desc">
                    {tl(
                      '二次开发必须开源 - 衍生项目必须以相同协议开源',
                      'Derivatives must be open source under the same license'
                    )}
                  </Text>
                </li>
              </ul>
              <Paragraph className="license-note">
                {tl(
                  '使用本软件即表示您同意遵守以上协议条款',
                  'By using this software you agree to the terms above'
                )}
              </Paragraph>
            </div>
          </div>

          <Divider className="about-divider" />

          <div className="about-section blessing-section">
            <Paragraph className="free-text">
              {tl(
                '改自 https://github.com/pmh1314520/ 创作的 MCTier',
                'Modified from MCTier by https://github.com/pmh1314520/'
              )}
            </Paragraph>
          </div>
        </motion.div>

        <motion.div
          className="about-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <Button type="primary" size="large" block onClick={onClose} className="close-button">
            {tl('返回', 'Back')}
          </Button>
        </motion.div>
      </motion.div>

      {/* 新手引导向导 */}
      <OnboardingWizard visible={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
};
