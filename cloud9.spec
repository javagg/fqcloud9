%global __jar_repack %{nil}
%global debug_package %{nil}

# Disable nodejs libraries check
%global __nodejs_provides %{nil}
%global __nodejs_requires %{nil}

Summary:       Cloud9 IDE
Name:          cloud9
Version:       0.7.0
Release:       1%{?dist}
Group:         Applications/Internet
License:       ASL 2.0
URL:           https://c9.io
Source0:       %{name}-%{version}.tar.gz

%description
Cloud9 IDE

%prep
%setup -q

%build
#!!! Don't build! It fails on Centos 6
#make package

%install
mkdir -p %{buildroot}%{_libdir}/%{name}
cp -a * %{buildroot}%{_libdir}/%{name}
mkdir -p %{buildroot}%{_bindir}
pushd %{buildroot}%{_bindir}
ln -s %{_libdir}/%{name}/bin/cloud9
ln -s %{_libdir}/%{name}/bin/c9ctl
ln -s %{_libdir}/%{name}/bin/c9config
popd

%files
%attr(-,root,root)
%{_libdir}/%{name}
%{_bindir}/c9ctl
%{_bindir}/cloud9
%{_bindir}/c9config

%changelog
* Mon Aug 05 2013 Alex Lee <lu.lee05@gmail.com> 0.7.0-1
- new package
